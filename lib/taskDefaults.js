// THE DEFAULT CHECKLISTS.
//
// These are EXAMPLES a customer starts from and then edits, not fixed
// process. They came out of pages/bookkeeping-*-tasks.js, where they were
// literal arrays inside the page - so every tenant got Rock Roofing's wording
// with no way to change it.
//
// Several are unmistakably Rock's: one names a Xero account code, one names a
// member of staff, two name their accountant. That is fine as a starting
// example and wrong as something a customer cannot edit.
//
// A stored list in the tenant's own database overrides these. See
// pages/api/task-definitions.js. Nothing is written until someone edits
// something, so a new customer inherits a usable list rather than a blank
// screen.

export const BK_WEEKLY = [
  { id: 'bw1', text: 'Ensure the email inbox is cleared and up to date by the end of each week.' },
  { id: 'bw2', text: 'Post all subcontractor invoices received during the week.' },
  { id: 'bw3', text: 'Prepare and process payments for all weekly subcontractors by Friday.' },
  { id: 'bw4', text: 'Post weekly payroll journals in Xero.' },
  { id: 'bw5', text: 'Review and resolve any bank reconciliation exceptions or unreconciled transactions.' },
  { id: 'bw6', text: 'Follow up on outstanding bookkeeping queries to avoid delays in month-end processing.' },
]

export const BK_MONTHLY = [
  { id: 'bm1', text: 'Reconcile supplier statements with supplier ledger balances.' },
  { id: 'bm2', text: 'Post all required prepayment journals.' },
  { id: 'bm3', text: 'Post inventory journals and reconcile inventory balances where applicable.' },
  { id: 'bm4', text: 'Complete bank balance reconciliations for all bank accounts.' },
  { id: 'bm13', text: 'Notify the Commercial Team that the WIP can now be completed.' },
  { id: 'bm5', text: 'Obtain the WIP schedule from Nathan and post the required WIP journals.' },
  { id: 'bm6', text: "Update all Apps by uploading the month's invoices and ensuring they are processed correctly." },
  { id: 'bm7', text: 'Review and reconcile retention balances with the relevant Apps/contracts.' },
  { id: 'bm8', text: 'Share the payroll timesheet with Cotton after the 21st of each month.' },
  { id: 'bm9', text: 'Create the payroll payment batch by the 28th of each month.' },
  { id: 'bm10', text: 'Ensure all Cost of Sales (COS) transactions have the correct tracking categories assigned.' },
  { id: 'bm11', text: 'Ensure all month-end journals have been posted before closing the period.' },
  { id: 'bm12', text: 'Confirm that all bookkeeping for the month is complete and ready for VAT preparation, and request Cotton to file VAT for the month.' },
]

export const COM_WEEKLY = [
  { id: 'w1', text: 'Have the project financials been updated? (Sync Bills, Sync Wages, Upload Bills)' },
  { id: 'w2', text: 'Have the project cash flows been updated for the next 13 weeks?' },
  { id: 'w3', text: 'Have the Project Details been fully completed?' },
  { id: 'w4', text: 'Has the Variation tracker been fully updated? (new variations added, correctly marked instructed / not instructed, correct amounts)' },
  { id: 'w5', text: 'Have the project financials been checked for accuracy? (budgets & spends accurate? correct cost allocations? missing costs? any projects strangely under/over performing?)' },
  { id: 'w6', text: 'Have all project reports been completed for all projects we were on site this week?' },
]
export const COM_MONTHLY = [
  { id: 'm1', text: 'Has the retention tracker been updated and is it accurate? (correct numbers? correct stages?)' },
  { id: 'm2', text: 'Have we raised invoices for any retentions that have become due?' },
  { id: 'm3', text: 'Does the applied-for amount match the invoiced amount in the retention tracker?' },
  { id: 'm4', text: 'Does the Retention Owed match 612 Allocated in the retention tracker?' },
  { id: 'm5', text: 'Have the project cash flows been updated for at least the next 12 months?' },
  { id: 'm6', text: 'Has the WIP been completed?' },
]
