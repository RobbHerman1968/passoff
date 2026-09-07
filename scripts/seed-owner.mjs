import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const ownerEmail = process.env.PASSOFF_DEFAULT_USER_EMAIL || "owner@example.com";
const organizationSlug = process.env.PASSOFF_DEFAULT_ORGANIZATION_SLUG || "passoff";
const workspaceSlug = process.env.PASSOFF_DEFAULT_WORKSPACE_SLUG || "main";
const projectSlug = process.env.PASSOFF_DEFAULT_PROJECT_SLUG || "agent-website";

const [user] = await sql`
  insert into users (email, name)
  values (${ownerEmail}, 'Rob Herman')
  on conflict (email) do update set name = excluded.name, updated_at = now()
  returning id, email, name
`;

const [organization] = await sql`
  insert into organizations (name, slug)
  values ('Pass-Off', ${organizationSlug})
  on conflict (slug) do update set name = excluded.name, updated_at = now()
  returning id, name, slug
`;

const [workspace] = await sql`
  insert into workspaces (organization_id, name, slug)
  values (${organization.id}, 'Main workspace', ${workspaceSlug})
  on conflict (organization_id, slug) do update set name = excluded.name, updated_at = now()
  returning id, name, slug
`;

await sql`
  insert into organization_memberships (organization_id, user_id, role, status)
  values (${organization.id}, ${user.id}, 'owner', 'active')
  on conflict (organization_id, user_id) do update set role = 'owner', status = 'active', updated_at = now()
`;

await sql`
  insert into workspace_memberships (workspace_id, user_id, role)
  values (${workspace.id}, ${user.id}, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner', updated_at = now()
`;

await sql`
  update workspaces
  set notification_email = coalesce(notification_email, ${ownerEmail}),
      reply_to_email = coalesce(reply_to_email, ${ownerEmail}),
      updated_at = now()
  where id = ${workspace.id}
`;

await sql`
  insert into subscriptions (
    organization_id, provider, plan, status,
    current_period_start, current_period_end, cancel_at_period_end
  )
  select
    ${organization.id}, 'passoff', 'trial', 'trialing',
    now(), now() + interval '14 days', 0
  where not exists (
    select 1 from subscriptions where organization_id = ${organization.id}
  )
`;

const [project] = await sql`
  insert into projects (organization_id, workspace_id, name, slug)
  values (${organization.id}, ${workspace.id}, 'Agent Website', ${projectSlug})
  on conflict (workspace_id, slug) do update set name = excluded.name, updated_at = now()
  returning id, name, slug
`;

console.log(JSON.stringify({ user, organization, workspace, project }, null, 2));
