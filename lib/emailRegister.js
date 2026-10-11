// THE REGISTER OF AUTOMATIC EMAILS (1080) - every email the portal can send,
// written from each sender's own code: what it is for, what triggers it, how
// often, and who receives it.
//
//   kind     'schedule' - sent by a scheduled job; 'event' - sent when something
//            happens (a button, a form, a customer's click)
//   when     plain words; scheduled times are UTC unless stated (UK summer time
//            is one hour ahead)
//   to       the recipient RULE
//   resolve  optional - lets the register list the people the rule reaches in
//            this company today: { roles: [...] } or { jobTitle: '...' }
//   sources  the route or job that sends it, as recorded in the sent log
//
// WHEN AN EMAIL IS ADDED TO THE PORTAL, ADD IT HERE. The sent log records every
// email regardless, so anything missing from this list still shows there.

export const EMAIL_REGISTER = [
  // ---- Scheduled -------------------------------------------------------------
  { id: 'task-reminders', area: 'Commercial / Bookkeeping', kind: 'schedule', name: 'Task reminders',
    purpose: 'The reminders set up on the Task reminders tab - weekly or monthly commercial and bookkeeping task reminders, and "not marked complete" follow-ups.',
    when: 'Checked daily 07:00; each sends on its own due day', to: 'The people chosen on each reminder', sources: ['cron notifications'] },
  { id: 'crm-activities', area: 'CRM', kind: 'schedule', name: 'CRM daily activities',
    purpose: 'Open CRM projects that have no next activity set.',
    when: 'Daily 07:00 UK', to: 'Pre-Contract and Admin users', resolve: { roles: ['pre-contract', 'admin'] }, sources: ['cron crm-daily-activities'] },
  { id: 'forms-weekly', area: 'Operations', kind: 'schedule', name: 'Weekly forms digest',
    purpose: 'Forms DUE this week: Pre-Starts for contracts managers; Start On Site Checklists, Daily Site Diaries and Works Area Handovers for site supervisors.',
    when: 'Mondays, with the 08:00 daily run', to: 'Contracts managers and site supervisors with forms due', sources: ['cron hs-expiry-email', '/api/cron/forms-weekly-notify', 'cron forms-weekly-notify'] },
  { id: 'deliveries', area: 'Operations', kind: 'schedule', name: 'Deliveries today',
    purpose: 'Deliveries due on site today, a reminder to mark them delivered and attach the delivery note, and who to call.',
    when: 'Daily, with the 08:00 daily run', to: 'The site supervisor of each project with a delivery due', sources: ['cron hs-expiry-email', '/api/cron/deliveries-notify', 'cron deliveries-notify'] },
  { id: 'hs-expiry', area: 'Health & Safety', kind: 'schedule', name: 'H&S training expiry digest',
    purpose: 'Training and tickets coming up for renewal.',
    when: '1st of each month, with the 08:00 daily run', to: 'Users with the Operations Manager job title', resolve: { jobTitle: 'Operations Manager' }, sources: ['cron hs-expiry-email'] },
  { id: 'rams-reminders', area: 'Health & Safety', kind: 'schedule', name: 'RAMS still to sign',
    purpose: 'A RAMS the operative has not signed yet.',
    when: 'Every 2 days per operative and RAMS, until signed', to: 'Each operative with an unsigned RAMS', sources: ['cron hs-expiry-email'] },
  { id: 'hs-renewals', area: 'Health & Safety', kind: 'schedule', name: 'CSCS / Working at Height renewals',
    purpose: 'Cards and tickets due for renewal - a reminder to each operative, and a weekly list for management.',
    when: 'Operatives: at most weekly, 08:00 UK. Management list: weekly on the set day (default Friday 17:00 UK)', to: 'Each operative concerned; the management list to the people set for it', sources: ['cron hs-renewals'] },
  { id: 'outstanding-invoices', area: 'Commercial', kind: 'schedule', name: 'Outstanding invoices report',
    purpose: 'The weekly outstanding invoices report, as a PDF.',
    when: 'Weekly, on the day and hour set on Outstanding Invoices', to: 'Post-Contract, Management and Admin users, plus any extra addresses set', resolve: { roles: ['post-contract', 'management', 'admin'] }, sources: ['cron weekly-report', 'cron hs-expiry-email'] },
  { id: 'variation-chase', area: 'Commercial', kind: 'schedule', name: 'Variation instruction chase',
    purpose: 'A reminder to instruct a variation that has not been instructed.',
    when: 'Once, 3 working days after the variation was sent (weekdays 09:00)', to: 'The customer contacts it was sent to (replies go to the sender)', sources: ['cron variation-reminders'] },
  { id: 'design-daily', area: 'Design', kind: 'schedule', name: 'Design daily comment digests',
    purpose: "One digest per project of the day's comments on RFIs, Tech Subs, drawings and calculations.",
    when: 'Daily 18:00, only for projects with comments that day', to: 'Everyone with access to the project, customer logins included', sources: ['cron design-rfi-daily', 'cron design-techsub-daily', 'cron design-rockdrawing-daily', 'cron design-calculation-daily'] },
  { id: 'rfi-outstanding', area: 'Design', kind: 'schedule', name: 'Outstanding RFIs',
    purpose: 'A table of the RFIs still open on a project.',
    when: 'Every 3 working days, 09:00, for projects with open RFIs', to: 'Everyone with access to the project', sources: ['cron design-rfi-outstanding'] },
  { id: 'health-alert', area: 'Portal', kind: 'schedule', name: 'Health alert',
    purpose: 'Says a scheduled job has stopped or is failing. Silent when all is well.',
    when: 'Daily 08:30, only when something is wrong', to: 'The portal maintainers', sources: ['cron health-alert'] },

  // ---- When something happens ------------------------------------------------
  { id: 'application', area: 'Commercial', kind: 'event', name: 'Application for payment', purpose: 'The application PDF.', when: 'When an application is sent', to: 'The customer contacts chosen (and anyone copied in)', sources: ['/api/application-send'] },
  { id: 'variation', area: 'Commercial', kind: 'event', name: 'Variation', purpose: 'The variation for the customer to review and instruct.', when: 'When a variation is sent', to: 'The customer contacts chosen (and anyone copied in)', sources: ['/api/variation-send'] },
  { id: 'variation-instructed', area: 'Commercial', kind: 'event', name: 'Variation instructed', purpose: 'Confirmation that the customer has instructed a variation.', when: 'When the customer clicks to instruct', to: 'The customer recipients, anyone copied in, and whoever sent it', sources: ['/api/variation-instruct'] },
  { id: 'invoice-chase', area: 'Commercial', kind: 'event', name: 'Invoice chase', purpose: 'A chase for an overdue invoice.', when: 'When a chase is sent from Outstanding Invoices', to: 'The customer contact chosen', sources: ['/api/chase-email-send'] },
  { id: 'invoices-now', area: 'Commercial', kind: 'event', name: 'Outstanding invoices report (sent now)', purpose: 'The outstanding invoices report, sent on demand.', when: 'When sent from Outstanding Invoices', to: 'The report recipients', sources: ['/api/outstanding-invoices'] },
  { id: 'wip', area: 'Commercial', kind: 'event', name: 'WIP complete', purpose: "Tells the bookkeeper the month's WIP is done.", when: 'When the WIP is marked complete', to: 'Active users with the Accounts role', resolve: { roles: ['accounts'] }, sources: ['/api/wip-lock'] },
  { id: 'in-query', area: 'Bookkeeping', kind: 'event', name: 'In Query items', purpose: "Each person's list of costs in query.", when: 'When the In Query list is sent', to: 'Each assignee, their own items', sources: ['/api/bookkeeping-inquery'] },
  { id: 'issue-raised', area: 'Operations', kind: 'event', name: 'Site issue raised', purpose: 'A new site issue, with a link to decide whether to send it to the customer.', when: 'When an issue is raised', to: "The project's Contracts Manager, Operations Manager and Quantity Surveyor", sources: ['/api/issue-notify'] },
  { id: 'issue-customer', area: 'Operations', kind: 'event', name: 'Issue to customer', purpose: 'A site issue sent to the customer.', when: 'When an issue is sent to the customer', to: 'The customer contacts chosen', sources: ['/api/issue-send-customer'] },
  { id: 'pre-start', area: 'Operations', kind: 'event', name: 'Pre-Start', purpose: 'The Pre-Start minutes PDF.', when: 'When the Pre-Start is sent', to: 'Every attendee', sources: ['/api/pre-start-send', '/api/pre-start-notify-send'] },
  { id: 'planning-week', area: 'Operations', kind: 'event', name: 'Weekly allocation', purpose: "Each operative's site allocation for the weeks chosen.", when: 'When sent from Planning', to: 'The operatives ticked', sources: ['/api/planning-week-email'] },
  { id: 'rams-approval', area: 'Health & Safety', kind: 'event', name: 'RAMS approval', purpose: 'A RAMS waiting for the next approval in the chain.', when: 'At each step of the RAMS approval chain', to: 'The next approver: Director, then the customer site manager, then the operatives', sources: ['/api/rams-approvals'] },
  { id: 'concern-invite', area: 'Operations', kind: 'event', name: 'Project concern meeting', purpose: 'A calendar invite (or update, or cancellation) for the next concern meeting.', when: 'When the meeting is set, moved or turned off', to: 'The meeting attendees', sources: ['/api/concern-invite'] },
  { id: 'process-tag', area: 'Operations', kind: 'event', name: 'Project Process tag', purpose: 'Someone has been tagged on the Project Process board.', when: 'When a person is tagged', to: 'The person tagged', sources: ['/api/project-process'] },
  { id: 'crm-mention', area: 'CRM', kind: 'event', name: 'CRM mention', purpose: 'Someone has been mentioned in a CRM note or comment.', when: 'When a person is @mentioned', to: 'The person mentioned', sources: ['/api/crm'] },
  { id: 'design-rfi', area: 'Design', kind: 'event', name: 'New RFI', purpose: 'A new RFI has been raised.', when: 'When an RFI is created', to: 'Everyone with access to the project', sources: ['/api/design-rfis'] },
  { id: 'design-techsub', area: 'Design', kind: 'event', name: 'Tech Sub for approval', purpose: 'A Tech Sub (or new revision) needs review and approval.', when: 'When a Tech Sub or revision is added, or Notify again', to: 'The customer approvers ticked', sources: ['/api/design-techsubs'] },
  { id: 'design-notify', area: 'Design', kind: 'event', name: 'Drawings / calculations uploaded', purpose: 'New drawings or calculations, for information or approval.', when: 'When Notify is used on Drawings or Calculations', to: 'Everyone on the project; those ticked are asked to approve', sources: ['/api/design-rock-drawings', '/api/design-drawings', '/api/design-calculations'] },
  { id: 'design-mention', area: 'Design', kind: 'event', name: 'Design comment mention', purpose: 'Someone has been @mentioned in a design comment.', when: 'When a person is @mentioned', to: 'The person mentioned', sources: [] },
  { id: 'portal-account', area: 'Portal', kind: 'event', name: 'Portal welcome / password reset', purpose: 'A new login with a temporary password, or a password reset link.', when: 'When a user is added, or asks for a reset', to: 'That user', sources: ['/api/portal-auth'] },
  { id: 'design-customer', area: 'Design', kind: 'event', name: 'Customer login', purpose: 'A customer given a login to the Design portal - their sign-in details.', when: 'When a customer login is created', to: 'That customer', sources: ['/api/design-customers'] },
  { id: 'site-pin', area: 'Site App', kind: 'event', name: 'Site App PIN', purpose: 'A temporary PIN for the Site App.', when: 'When an operative asks for a PIN reset', to: 'That operative', sources: ['/api/ops-users'] },
  { id: 'improvement', area: 'Portal', kind: 'event', name: 'App improvement', purpose: 'A reported improvement - to the maintainers when raised, and to the person who raised it when resolved.', when: 'When raised, and when marked resolved', to: 'The maintainers; then the person who raised it', sources: ['/api/report-problem'] },
  { id: 'error-report', area: 'Portal', kind: 'event', name: 'Error report', purpose: 'A page or job failed.', when: 'When something fails', to: 'The portal maintainers', sources: [] },
  { id: 'test-email', area: 'Portal', kind: 'event', name: 'Test email', purpose: 'Checks email sending works.', when: 'When an admin sends a test', to: 'The address typed', sources: ['/api/test-email'] },
]

// The register entry a logged email most likely belongs to, from its source.
// Several emails share a scheduled run (the 08:00 daily run sends five kinds),
// so where a source is shared this returns them all and the subject tells them
// apart.
export function registerFor(source) {
  const s = String(source || '')
  return EMAIL_REGISTER.filter(e => (e.sources || []).some(src => s === src || s.startsWith(src + '/')))
}
