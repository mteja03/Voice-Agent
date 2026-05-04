/**
 * Tokens supported by the backend (templatePlaceholders.js).
 * Keep in sync when adding new placeholders.
 */
export const CONVERSATION_PLACEHOLDER_GROUPS = [
  {
    title: 'Lead (from active lead / CRM row)',
    items: [
      { token: '{leadName}', hint: 'Full name, or Telugu default if empty' },
      { token: '{leadFirstName}', hint: 'First word of name' },
      { token: '{leadPhone}', hint: '' },
      { token: '{leadLocation}', hint: '' },
      { token: '{leadBudget}', hint: '' },
      { token: '{leadSource}', hint: '' },
      { token: '{leadNotes}', hint: '' },
      { token: '{leadOutcome}', hint: 'lastOutcome or status' },
      { token: '{leadNextAction}', hint: '' },
      { token: '{leadFollowupDate}', hint: '' },
      { token: '{leadId}', hint: 'Internal id' },
    ],
  },
  {
    title: 'Company (from Company Profile)',
    items: [
      { token: '{companyName}', hint: 'Workspace company name' },
      { token: '{companyTagline}', hint: '' },
      { token: '{companyPhone}', hint: '' },
      { token: '{companyEmail}', hint: '' },
      { token: '{companyWebsite}', hint: '' },
      { token: '{companyHeadOffice}', hint: '' },
      { token: '{companyAreas}', hint: 'Comma-separated' },
      { token: '{companyProjectTypes}', hint: 'Comma-separated' },
      { token: '{companySocialFacebook}', hint: '' },
    ],
  },
  {
    title: 'Agent',
    items: [{ token: '{agentName}', hint: 'From Agent configuration' }],
  },
  {
    title: 'Date & time (Asia/Kolkata by default)',
    items: [
      { token: '{dateToday}', hint: 'Long date, e.g. Sunday, 3 May 2026' },
      { token: '{dateShort}', hint: 'YYYY-MM-DD' },
      { token: '{timeNow}', hint: 'Local time in configured timezone' },
      { token: '{weekday}', hint: '' },
      { token: '{year}', hint: '' },
      { token: '{monthName}', hint: '' },
      { token: '{dayNumber}', hint: '' },
      { token: '{timezone}', hint: 'IANA zone (set CONVERSATION_TEMPLATE_TZ on server to change)' },
    ],
  },
];
