
import { Inngest } from "inngest";
import prisma from "../configs/prisma.js";
import sendEmail from "../configs/nodemailer.js";
import { syncOrganization, upsertClerkUser } from "../services/clerkSync.js";

// Log email configuration
console.log('Email configuration:', {
    smtpUser: process.env.SMTP_USER ? 'configured' : 'missing',
    senderEmail: process.env.SENDER_EMAIL ? 'configured' : 'missing'
});

// Create Inngest client
export const inngest = new Inngest({ id: "waypoint" });

// Sync newly created Clerk users to the database
const syncUserCreation = inngest.createFunction(
  {
    id: "sync-user-from-clerk",
    triggers: [{ event: "clerk/user.created" }],
  },
  async ({ event }) => {
    const { data } = event;

    await prisma.user.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        email: data?.email_addresses?.[0]?.email_address,
        name: `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim(),
        image: data?.image_url ?? "",
      },
      update: {
        email: data?.email_addresses?.[0]?.email_address,
        name: `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim(),
        image: data?.image_url ?? "",
      },
    });
  }
);

// Delete users from the database when deleted in Clerk
const syncUserDeletion = inngest.createFunction(
  {
    id: "delete-user-with-clerk",
    triggers: [{ event: "clerk/user.deleted" }],
  },
  async ({ event }) => {
    const { data } = event;

    await prisma.user.deleteMany({
      where: {
        id: data.id,
      },
    });
  }
);

// Update users in the database when updated in Clerk
const syncUserUpdation = inngest.createFunction(
  {
    id: "update-user-from-clerk",
    triggers: [{ event: "clerk/user.updated" }],
  },
  async ({ event }) => {
    const { data } = event;

    await prisma.user.upsert({
      where: {
        id: data.id,
      },
      create: {
        id: data.id,
        email: data?.email_addresses?.[0]?.email_address,
        name: `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim(),
        image: data?.image_url ?? "",
      },
      update: {
        email: data?.email_addresses?.[0]?.email_address,
        name: `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim(),
        image: data?.image_url ?? "",
      },
    });
  }
);


// Inngest function to save workspace data
const syncWorkspaceCreation = inngest.createFunction(
  {
    id: "sync-workspace-from-clerk",
    triggers: [{ event: "clerk/organization.created" }],
  },
  async ({ event }) => {
    const { data } = event;

    const ownerId = data.created_by || data.createdBy;
    if (ownerId) {
      await upsertClerkUser(ownerId);
    }
    await syncOrganization(data.id);
  }
);

// Inngest function to update workspace data
const syncWorkspaceUpdation = inngest.createFunction(
  {
    id: "update-workspace-from-clerk",
    triggers: [{ event: "clerk/organization.updated" }],
  },
  async ({ event }) => {
    const { data } = event;

    await prisma.workspace.update({
      where: { id: data.id },
      data: {
        name: data.name,
        slug: data.slug,
        image_url: data.image_url,
      },
    });
  }
);

// Inngest function to delete workspace data
const syncWorkspaceDeletion = inngest.createFunction(
  {
    id: "delete-workspace-from-clerk",
    triggers: [{ event: "clerk/organization.deleted" }],
  },
  async ({ event }) => {
    const { data } = event;

    await prisma.workspace.delete({
      where: { id: data.id },
    });
  }
);

// Inngest function to save workspace member data
const syncWorkspaceMemberCreation = inngest.createFunction(
  {
    id: "sync-workspace-member-from-clerk",
    triggers: [{ event: "clerk/organizationInvitation.accepted" }],
  },
  async ({ event }) => {
    const { data } = event;

    const orgId = data.organization_id || data.organization?.id;
    if (orgId) {
      await syncOrganization(orgId);
    }
  }
);

const syncWorkspaceMembershipCreated = inngest.createFunction(
  {
    id: "sync-workspace-membership-from-clerk",
    triggers: [{ event: "clerk/organizationMembership.created" }],
  },
  async ({ event }) => {
    const { data } = event;
    const orgId = data.organization?.id || data.organization_id;
    if (orgId) {
      await syncOrganization(orgId);
    }
  }
);

// Inngest fuction to Send email on task creation

const sendTaskAssignmentEmail = inngest.createFunction(
  {
    id: "send-task-assignment-mail",
    triggers: [{ event: "app/task.assigned" }],
  },
  async ({ event, step }) => {
    const { taskId, origin } = event.data;

    // Fetch task details
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: true,
        project: true,
      },
    });

    // Stop if the task no longer exists
    if (!task) return;

    // Send an assignment email for legacy events only. New task requests send
    // this directly and set skipAssignmentEmail to avoid duplicate messages.
    if (!event.data.skipAssignmentEmail) {
      await step.run("send-task-assignment-email", async () => {
      await sendEmail({
        to: task.assignee.email,
        subject: `New Task Assignment in ${task.project.name}`,
        body: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <h2>Hi ${task.assignee.name},</h2>

            <p style="font-size: 16px;">
              You've been assigned a new task:
            </p>

            <p style="font-size: 18px; font-weight: bold; color: #007bff; margin: 8px 0;">
              ${task.title}
            </p>

            <div style="border: 1px solid #ddd; padding: 12px 16px; border-radius: 6px; margin-bottom: 30px;">
              <p style="margin: 6px 0;">
                <strong>Description:</strong> ${task.description ?? "No description provided"}
              </p>

              <p style="margin: 6px 0;">
                <strong>Due Date:</strong>
                ${task.due_date ? new Date(task.due_date).toLocaleDateString() : "Not specified"}
              </p>
            </div>

            <a href="${origin}"
               style="display: inline-block; background-color: #007bff; padding: 12px 24px; border-radius: 5px; color: #fff; font-weight: 600; font-size: 16px; text-decoration: none;">
              View Task
            </a>

            <p style="margin-top: 20px; font-size: 14px; color: #6c757d;">
              Please review and complete the task before the due date.
            </p>
          </div>
        `,
      });
      });
    }

    // Schedule a reminder if the due date is not today
    if (
      task.due_date &&
      new Date(task.due_date).toDateString() !==
        new Date().toDateString()
    ) {
      await step.sleepUntil(
        "wait-for-the-due-date",
        new Date(task.due_date)
      );

      // Fetch the latest task status at the due date
      const latestTask = await step.run(
        "check-if-task-is-completed",
        async () => {
          return await prisma.task.findUnique({
            where: { id: taskId },
            include: {
              assignee: true,
              project: true,
            },
          });
        }
      );

      // Send a reminder only if the task still exists and is incomplete
      if (latestTask && latestTask.status !== "DONE") {
        await step.run("send-task-reminder-email", async () => {
          await sendEmail({
            to: latestTask.assignee.email,
            subject: `Reminder for ${latestTask.project.name}`,
            body: `
              <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                <h2>Hi ${latestTask.assignee.name},</h2>

                <p style="font-size: 16px;">
                  You have a task due in ${latestTask.project.name}:
                </p>

                <p style="font-size: 18px; font-weight: bold; color: #007bff; margin: 8px 0;">
                  ${latestTask.title}
                </p>

                <div style="border: 1px solid #ddd; padding: 12px 16px; border-radius: 6px; margin-bottom: 30px;">
                  <p style="margin: 6px 0;">
                    <strong>Description:</strong>
                    ${latestTask.description ?? "No description provided"}
                  </p>

                  <p style="margin: 6px 0;">
                    <strong>Due Date:</strong>
                    ${new Date(latestTask.due_date).toLocaleDateString()}
                  </p>
                </div>

                <a href="${origin}"
                   style="display: inline-block; background-color: #007bff; padding: 12px 24px; border-radius: 5px; color: #fff; font-weight: 600; font-size: 16px; text-decoration: none;">
                  View Task
                </a>

                <p style="margin-top: 20px; font-size: 14px; color: #6c757d;">
                  Please review and complete the task as soon as possible.
                </p>
              </div>
            `,
          });
        });
      }
    }
  }
);

const sendProjectMembershipEmail = inngest.createFunction(
  {
    id: "send-project-membership-email",
    triggers: [{ event: "app/project.memberAdded" }],
  },
  async ({ event }) => {
    const { email, memberName, projectName, origin } = event.data;
    await sendEmail({
      to: email,
      subject: `You've been added to ${projectName}`,
      body: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h2>Hi ${memberName || "there"},</h2>
          <p>You have been added to the project <strong>${projectName}</strong>.</p>
          <a href="${origin}" style="display:inline-block;background:#2563eb;padding:12px 24px;border-radius:6px;color:#fff;text-decoration:none;">Open Waypoint</a>
        </div>
      `,
    });
  }
);

// Inngest function to send workspace invitation email
const sendWorkspaceInvitationEmail = inngest.createFunction(
  {
    id: "send-workspace-invitation-mail",
    triggers: [{ event: "app/workspace.invitation" }],
  },
  async ({ event }) => {
    const { inviteeEmail, inviteeName, workspaceName, inviterName, origin } = event.data;

    try {
      await sendEmail({
        to: inviteeEmail,
        subject: `You've been invited to join ${workspaceName}`,
        body: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <h2>Hi ${inviteeName},</h2>

            <p style="font-size: 16px;">
              ${inviterName} has invited you to join the workspace <strong>${workspaceName}</strong>.
            </p>

            <p style="font-size: 16px; margin: 20px 0;">
              Log in to your account to accept the invitation and start collaborating with your team.
            </p>

            <a href="${origin}"
               style="display: inline-block; background-color: #007bff; padding: 12px 24px; border-radius: 5px; color: #fff; font-weight: 600; font-size: 16px; text-decoration: none;">
              Go to Workspace
            </a>

            <p style="margin-top: 20px; font-size: 14px; color: #6c757d;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Failed to send workspace invitation email:', error);
      throw error;
    }
  }
);



// Export functions for the Inngest endpoint
export const functions = [
    syncUserCreation,
    syncUserDeletion,
    syncUserUpdation,
    syncWorkspaceCreation,
    syncWorkspaceUpdation,
    syncWorkspaceDeletion,
    syncWorkspaceMemberCreation,
    syncWorkspaceMembershipCreated,
    sendTaskAssignmentEmail,
    sendProjectMembershipEmail,
    sendWorkspaceInvitationEmail
];
