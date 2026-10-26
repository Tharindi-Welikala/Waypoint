import prisma from "../configs/prisma.js"
import { handleError } from "../utils/errorHandler.js"
import sendEmail from "../configs/nodemailer.js"

const sendProjectMemberEmail = ({ email, name, projectName, origin }) => sendEmail({
  to: email,
  subject: `You've been added to ${projectName}`,
  body: `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
      <h2>Hi ${name || "there"},</h2>
      <p>You have been added to the project <strong>${projectName}</strong>.</p>
      ${origin ? `<a href="${origin}" style="display:inline-block;background:#2563eb;padding:12px 24px;border-radius:6px;color:#fff;text-decoration:none;">Open Waypoint</a>` : ""}
    </div>
  `,
});

// Get single project
export const getProject = async (req, res) => {
  try {
    const { userId } = await req.auth();
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        members: { include: { user: true } },
        tasks: { include: { assignee: true, comments: { include: { user: true } } } },
        owner: true,
        workspace: {
          include: {
            members: true
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if user is a member of the workspace
    const isWorkspaceMember = project.workspace.members.some(
      (member) => member.userId === userId
    );

    if (!isWorkspaceMember) {
      return res.status(403).json({ message: "You do not have access to this project" });
    }

    res.json({ project });
  } catch (error) {
    handleError(error, res, "Failed to fetch project");
  }
}

//create project
export const createProject = async (req, res) => {
  try {
    const {userId} = await req.auth();
    const {workspaceId, description, name, status, start_date, end_date,
    team_members, team_lead, progress, priority} = req.body;
    // check if user has admin role for workspace
    const workspace = await prisma.workspace.findUnique({
        where: {id: workspaceId},
        include: {members: {include: {user: true}}}
    })

    if (!workspace){
        return res.status(404).json({ message: "Workspace not found"});
    }

    if(!workspace.members.some((member)=>member.userId === userId && member.role === "ADMIN")){
        return res.status(403).json({ message: "You don't have permission to create projects in this workspace"});
    }

    // get Team lead using email
    const teamLead = workspace.members.find((member) => member.user.email === team_lead);
    if (!teamLead) {
      return res.status(400).json({ message: "Project lead must be a workspace member" });
    }

    const memberIds = workspace.members
      .filter((member) => team_members?.includes(member.user.email))
      .map((member) => member.user.id);

    const project = await prisma.project.create({
        data: {
            workspaceId,
            name,
            description,
            status,
            priority,
            progress,
            team_lead: teamLead.userId,
            start_date: start_date ? new Date(start_date) : null,
            end_date: end_date ? new Date(end_date) : null,
            members: {
              create: memberIds.map((userId) => ({ userId })),
            },
        },
        include: {
          members: { include: { user: true } },
          tasks: { include: { assignee: true, comments: { include: { user: true } } } },
          owner: true,
        },
    })

    const projectMembersToNotify = project.members.filter((member) => member.userId !== userId);
    const projectEmailResults = await Promise.all(projectMembersToNotify.map(async (member) => {
      try {
        await sendProjectMemberEmail({
          email: member.user.email,
          name: member.user.name,
          projectName: project.name,
          origin: req.get("origin"),
        });
        return true;
      } catch (error) {
        console.error("Failed to send project membership email:", error);
        return false;
      }
    }));
    
    res.json({
      project,
      message: "Project created successfully.",
      projectNotificationsSent: projectEmailResults.every(Boolean),
    })

  } catch (error) {
    handleError(error, res, "An error occurred while processing the request");
  }
}

// update project
export const updateProject = async (req, res) => {
  try {
    const { userId } = await req.auth();
    const {id, workspaceId, description, name, status, start_date, end_date,
    team_members, team_lead, progress, priority} = req.body;

    // check if user has admin role
    const workspace = await prisma.workspace.findUnique({
        where: {id: workspaceId},
        include: {members: {include: {user: true}}}
    })

    if(!workspace){
      return res.status(404).json({ message: "Workspace not found"});
    }

    if(!workspace.members.some((member)=>member.userId === userId && member.role === "ADMIN")){
        const project = await prisma.project.findUnique({
            where: {id}
        })

        if(!project){
            return res.status(404).json({message: "Project not found" });
        } else if (project.team_lead !== userId) {
            return res.status(403).json({message: "You do not have permission to update projects in this workspace"});
        }

        // Check if user is still a member of the workspace
        if(!workspace.members.some((member)=>member.userId === userId)){
            return res.status(403).json({message: "You are not a member of this workspace"});
        }
    }

    // Handle team_lead update if provided
    let teamLeadId = undefined;
    if (team_lead) {
        const teamLead = await prisma.user.findUnique({
            where: {email: team_lead},
            select: {id : true}
        });
        teamLeadId = teamLead?.id;
    }

    const project = await prisma.project.update({
        where: {id},
        data: {
            workspaceId,
            description,
            name,
            status,
            priority,
            progress,
            team_lead: teamLeadId,
            start_date: start_date ? new Date(start_date) : null,
            end_date: end_date ? new Date(end_date) : null,
        }
    })

    res.json({project, message: "Project updated successfully."})

  } catch (error) {
    handleError(error, res, "An error occurred while processing the request");
  }
}

// add member to project
export const addMember = async (req, res) => {
  try {
    const {userId} = await req.auth();
    const { projectId }= req.params;
    const {email} = req.body;

    //check if user is project lead
    const project = await prisma.project.findUnique({
        where: {id: projectId},
        include: {members: {include: {user: true}}}
    })

    if(!project){
        return res.status(404).json({message: "Project not found" });
    }

    if(project.team_lead !== userId){
        return res.status(403).json({message: "Only project lead can add members"});
    }

    // check if user is already a member
    const existingMember = project.members.find((member)=>member.user.email === email)

    if(existingMember){
        return res.status(400).json({message: "User is already a member" });
    }

    const user = await prisma.user.findUnique({where: {email}});

    if(!user){
        return res.status(404).json({message: "User not found" });
    }

    // Check if user is a member of the workspace
    const workspace = await prisma.workspace.findUnique({
        where: {id: project.workspaceId},
        include: {members: true}
    });

    if(!workspace.members.some((member)=>member.userId === user.id)){
        return res.status(403).json({message: "User is not a member of the workspace"});
    }

    const member = await prisma.projectMember.create({
        data: {
            userId: user.id,
            projectId
        },
        include: { user: true },
    })

    let notificationSent = false;
    try {
      await sendProjectMemberEmail({
        email: member.user.email,
        name: member.user.name,
        projectName: project.name,
        origin: req.get("origin"),
      });
      notificationSent = true;
    } catch (error) {
      console.error("Failed to send project membership email:", error);
    }

    res.json({ member, message: "Member added successfully!", notificationSent });

  } catch (error) {
    handleError(error, res, "An error occurred while processing the request");
  }
}
