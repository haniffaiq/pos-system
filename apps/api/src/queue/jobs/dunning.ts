import type { Job } from "bullmq";

import { withAdmin } from "../../db/withTenant";
import type { DunningJob } from "../queues";
import { emailQueue } from "../queues";

type TrialReminderRow = {
  tenant_id: string;
  email: string;
  business_name: string | null;
  trial_ends_at: Date;
};

export async function dunningProcessor(_job: Job<DunningJob>): Promise<void> {
  await dunningStep();
}

export async function dunningStep(): Promise<void> {
  await withAdmin(async (q) => {
    const trialReminders = await q<TrialReminderRow>(
      `select distinct on (t.id) t.id as tenant_id, u.email, t.name as business_name, s.trial_ends_at
         from subscriptions s
         join tenants t on t.id = s.tenant_id
         join users u on u.tenant_id = t.id and u.role = 'owner'
        where s.status = 'trialing'
          and s.trial_ends_at between now() and now() + interval '3 days'
        order by t.id, u.created_at asc`,
    );

    await Promise.all(
      trialReminders.rows.map((row) =>
        emailQueue.add(
          "trial-reminder",
          {
            to: row.email,
            template: "trial_reminder",
            vars: {
              businessName: row.business_name ?? "your BroSolution workspace",
              trialEndsAt: row.trial_ends_at.toISOString(),
            },
          },
          { jobId: `trial-reminder:${row.tenant_id}:${row.trial_ends_at.toISOString().slice(0, 10)}` },
        ),
      ),
    );

    await q(
      `update subscriptions s
          set status='past_due', updated_at=now()
        where s.status='active'
          and s.current_period_end < now()
          and not exists (
            select 1
              from invoices i
             where i.subscription_id=s.id
               and i.status='paid'
               and i.created_at > s.current_period_end - interval '7 days'
          )`,
    );

    await q(
      `update subscriptions
          set status='suspended', updated_at=now()
        where status='past_due'
          and current_period_end < now() - interval '3 days'`,
    );
  });
}
