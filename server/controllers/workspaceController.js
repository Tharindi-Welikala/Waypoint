import prisma from "../configs/prisma.js";
import { deleteClerkOrganization, mapWorkspaceRole, syncWorkspacesForUser } from "../services/clerkSync.js";
import { handleError } from "../utils/errorHandler.js";
import { inngest } from "../inngest/index.js";

// Get all workspaces for user
export const getUserWorkspaces = async (req, res) => {
    try {
        const {userId} = await req.auth();
        await syncWorkspacesForUser(userId);
        const workspaces = await prisma.workspace.findMany({
            where: {
                members: {some: {userId: userId}}
                },
                include: {
                    members: {include: {user: true}},
                projects: {
                    include: {
                        tasks: {include: {assignee: true, comments: {include: {user: true}}}},
                        members: {include: {user: true}},
                    },
                },  
                owner: true          
            }
        });
        res.json({workspaces});
    } catch (error) {
        handleError(error, res, "Failed to fetch workspaces");
    }
}

// Delete a workspace from Clerk and the application database.
export const deleteWorkspace = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { workspaceId } = req.params;
        let workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, ownerId: true },
        });

        if (!workspace) {
            // The database may have been edited directly while Clerk still owns
            // the organization. Re-sync only this user's Clerk memberships first.
            await syncWorkspacesForUser(userId);
            workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { id: true, ownerId: true },
            });
            if (!workspace) {
                return res.status(404).json({ message: "Workspace not found" });
            }
        }

        if (workspace.ownerId !== userId) {
            return res.status(403).json({ message: "Only the workspace creator can delete it" });
        }

        try {
            await deleteClerkOrganization(workspaceId);
        } catch (error) {
            // If Clerk already removed it, clean up the stale Neon row as well.
            if (error?.status !== 404 && error?.statusCode !== 404) throw error;
        }
        await prisma.workspace.deleteMany({ where: { id: workspaceId } });

        return res.json({ message: "Workspace deleted successfully" });
    } catch (error) {
        return handleError(error, res, "Failed to delete workspace");
    }
};

// Add member to workspace
export const addMemberToWorkspace = async (req, res) => {
    try {
        const {userId} = await req.auth();
        const {email, role, workspaceId, message} = req.body;
        const mappedRole = mapWorkspaceRole(role);

        if (!workspaceId || !role) {
            return res.status(400).json({message: "Workspace ID and role are required"});
        }

        if (!email) {
            return res.status(400).json({message: "Email is required"});
        }

        const actor = await prisma.user.findUnique({where: {id: userId}});

        if (!actor) {
            return res.status(404).json({message: "User not found"});
        }

        // fetch workspace
        const workspace = await prisma.workspace.findUnique({
            where: {id: workspaceId},
            include: {members: true}
        });

        if (!workspace) {
            return res.status(404).json({message: "Workspace not found"});
        }

        // check creator has admin role
        if (!workspace.members.find(member => member.userId === userId && member.role === "ADMIN")) {
            return res.status(401).json({message: "You do not have permission to add members to this workspace"});
        }

        const invitee = await prisma.user.findUnique({where: {email}});

        if (!invitee) {
            return res.status(404).json({message: "No user with that email has signed up yet"});
        }

        // Check if user is already a member
        const existingMember = workspace.members.find((member) => member.userId === invitee.id);

        if (existingMember) {
            return res.status(400).json({message: "User is already a member of this workspace"});
        }

        const member = await prisma.workspaceMember.create({
            data: {
                userId: invitee.id,
                workspaceId,
                role: mappedRole,
                message
            }
        });

        // Send invitation email via Inngest
        await inngest.send({
            name: "app/workspace.invitation",
            data: {
                inviteeEmail: invitee.email,
                inviteeName: invitee.name,
                workspaceName: workspace.name,
                inviterName: actor.name,
                origin: req.get('origin')
            }
        });

        res.json({member, message: "Member added to workspace"});

    } catch (error) {
        handleError(error, res, "Failed to add member to workspace");
    }
}
