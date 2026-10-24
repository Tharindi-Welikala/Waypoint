import { clerkClient } from "@clerk/express";
import prisma from "../configs/prisma.js";

async function getClerk() {
  return typeof clerkClient === "function" ? await clerkClient() : clerkClient;
}

function listData(result) {
  if (Array.isArray(result)) return result;
  return result?.data ?? [];
}

export function mapWorkspaceRole(role) {
  const value = String(role ?? "").toLowerCase();
  if (value.includes("admin")) return "ADMIN";
  return "MEMBER";
}

export async function upsertClerkUser(userId) {
  if (!userId) return null;

  const clerk = await getClerk();
  const user = await clerk.users.getUser(userId);
  const email =
    user.primaryEmailAddress?.emailAddress ||
    user.emailAddresses?.[0]?.emailAddress;

  if (!email) {
    throw new Error(`Clerk user ${userId} has no email address`);
  }

  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || email;

  return prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email,
      name,
      image: user.imageUrl ?? "",
    },
    update: {
      email,
      name,
      image: user.imageUrl ?? "",
    },
  });
}

export async function syncOrganization(orgId) {
  if (!orgId) return null;

  const clerk = await getClerk();
  const org = await clerk.organizations.getOrganization({ organizationId: orgId });
  const members = listData(
    await clerk.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    })
  );

  const ownerId = org.createdBy || members[0]?.publicUserData?.userId;
  if (!ownerId) {
    throw new Error(`Organization ${orgId} has no owner to sync`);
  }

  await upsertClerkUser(ownerId);

  for (const member of members) {
    const memberUserId = member.publicUserData?.userId;
    if (memberUserId && memberUserId !== ownerId) {
      await upsertClerkUser(memberUserId);
    }
  }

  await prisma.workspace.upsert({
    where: { id: org.id },
    create: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      ownerId,
      image_url: org.imageUrl ?? "",
    },
    update: {
      name: org.name,
      slug: org.slug,
      image_url: org.imageUrl ?? "",
    },
  });

  for (const member of members) {
    const memberUserId = member.publicUserData?.userId;
    if (!memberUserId) continue;

    await prisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: memberUserId,
          workspaceId: org.id,
        },
      },
      create: {
        userId: memberUserId,
        workspaceId: org.id,
        role: mapWorkspaceRole(member.role),
      },
      update: {
        role: mapWorkspaceRole(member.role),
      },
    });
  }

  return org.id;
}

export async function syncWorkspacesForUser(userId) {
  await upsertClerkUser(userId);

  const clerk = await getClerk();
  const memberships = listData(
    await clerk.users.getOrganizationMembershipList({
      userId,
      limit: 100,
    })
  );

  for (const membership of memberships) {
    const orgId = membership.organization?.id;
    if (orgId) {
      await syncOrganization(orgId);
    }
  }
}
