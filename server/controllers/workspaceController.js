import prisma from "../configs/prisma.js";
import { mapWorkspaceRole, syncWorkspacesForUser } from "../services/clerkSync.js";

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
        console.log(error);
        res.status(500).json({message: error.code || error.message });
    }
}

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

        res.json({member, message: "Member added to workspace"});
        
    } catch (error) {
        console.log(error);
        res.status(500).json({message: error.code || error.message });
    }
}