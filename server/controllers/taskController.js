import prisma from "../configs/prisma.js";
import { inngest } from "../inngest/index.js";
import { handleError } from "../utils/errorHandler.js";
import sendEmail from "../configs/nodemailer.js";


// Create task
export  const createTask = async (req, res) => {
    try{
        const {userId} = await req.auth();
        const {projectId, title, description, type, status, priority, assigneeId, due_date} = req.body;
        const origin = req.get('origin')

        //check if user has admin role for project
        const project = await prisma.project.findUnique({
            where: {id: projectId},
            include: {
                members: {select: {userId: true}},
                workspace: {include: {members: {select: {userId: true}}}},
            },
        })

        if(!project){
            return res.status(404).json({message: "Project not found"});
        } else if(project.team_lead !== userId){
            return res.status(403).json({message: "You do not have admin privileges for this project."});
        } else if(assigneeId && !project.members.some((member)=>member.userId === assigneeId)){
            return res.status(403).json({message: "Assignee is not a member of this project/workspace"});
        }

        if(!project.workspace.members.some((member)=>member.userId === userId)){
            return res.status(403).json({message: "You are not a member of this workspace"});
        }

        const task = await prisma.task.create({
            data: {
                projectId,
                title,
                description,
                priority,
                assigneeId,
                status,
                type,
                due_date: due_date ? new Date(due_date) : null
            },
            include: {assignee: true},
        })

        let assignmentEmailSent = false;
        try {
            const taskUrl = origin
                ? `${origin.replace(/\/$/, "")}/taskDetails?projectId=${encodeURIComponent(projectId)}&taskId=${encodeURIComponent(task.id)}`
                : "";
            await sendEmail({
                to: task.assignee.email,
                subject: `New task assigned to you in ${project.name}`,
                body: `
                    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
                        <h2>Hi ${task.assignee.name || "there"},</h2>
                        <p>You have been assigned a new task in <strong>${project.name}</strong>.</p>
                        <p style="font-size:18px;font-weight:bold;color:#2563eb;">${task.title}</p>
                        ${task.description ? `<p>${task.description}</p>` : ""}
                        <p>Due: ${new Date(task.due_date).toLocaleDateString()}</p>
                        ${taskUrl ? `<a href="${taskUrl}" style="display:inline-block;background:#2563eb;padding:12px 24px;border-radius:6px;color:#fff;text-decoration:none;">View task</a>` : ""}
                    </div>
                `,
            });
            assignmentEmailSent = true;
        } catch (error) {
            console.error("Failed to send task assignment email:", error);
        }

        // Keep the durable due-date reminder workflow separate from the
        // immediate assignment email.
        const notificationDispatch = inngest.send({
            name: "app/task.assigned",
            data: { taskId: task.id, origin, skipAssignmentEmail: true },
        }).catch((error) => {
            console.error("Failed to queue task assignment notification:", error);
        });
        let notificationTimeout;
        await Promise.race([
            notificationDispatch,
            new Promise((resolve) => { notificationTimeout = setTimeout(resolve, 1500); }),
        ]);
        clearTimeout(notificationTimeout);

        res.json({ task, message: "Task created successfully!", assignmentEmailSent })
    }catch(error){
        handleError(error, res, "An error occurred while processing the request");
    }
}

// Update task
export  const updateTask = async (req, res) => {
    try{

        const task = await prisma.task.findUnique({
            where: {id: req.params.id}
        })

        if(!task){
            return res.status(404).json({message: "Task not found"});
        }

        const {userId} = await req.auth();

        const project = await prisma.project.findUnique({
            where: {id: task.projectId},
            include: {members: {include: {user: true}}}
        })

        if(!project){
            return res.status(404).json({message: "Project not found"});
        } else if(project.team_lead !== userId){
            return res.status(403).json({message: "You do not have admin privileges for this project."});
        }

        // Check if user is still a member of the workspace
        const workspace = await prisma.workspace.findUnique({
            where: {id: project.workspaceId},
            include: {members: true}
        });

        if(!workspace.members.some((member)=>member.userId === userId)){
            return res.status(403).json({message: "You are not a member of this workspace"});
        }

        const updatedTask = await prisma.task.update({
            where: {id: req.params.id},
            data: req.body
        })

        res.json({task: updatedTask, message: "Task updated successfully!"})
    }catch(error){
        handleError(error, res, "An error occurred while processing the request");
    }
}

// Delete Task
export  const deleteTask = async (req, res) => {
    try{

        const {userId} = await req.auth();
        const {tasksIds} = req.body
        const tasks = await prisma.task.findMany({
            where: {id: {in: tasksIds}}
        })

        if(tasks.length === 0){
            return res.status(404).json({message: "Task not found"});
        }

        const project = await prisma.project.findUnique({
            where: {id: tasks[0].projectId},
            include: {members: {include: {user: true}}}
        })

        if(!project){
            return res.status(404).json({message: "Project not found"});
        } else if(project.team_lead !== userId){
            return res.status(403).json({message: "You do not have admin privileges for this project."});
        }

        // Check if user is still a member of the workspace
        const workspace = await prisma.workspace.findUnique({
            where: {id: project.workspaceId},
            include: {members: true}
        });

        if(!workspace.members.some((member)=>member.userId === userId)){
            return res.status(403).json({message: "You are not a member of this workspace"});
        }

        await prisma.task.deleteMany({
            where: {id: {in: tasksIds}}

        })

        res.json({message: "Task deleted successfully!"})
    }catch(error){
        handleError(error, res, "An error occurred while processing the request");
    }
}
