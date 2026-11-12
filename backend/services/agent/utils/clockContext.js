export const getClockContext = (requestedTimeZone, now = new Date()) => {
    let timeZone = 'UTC'
    if (typeof requestedTimeZone === 'string' && requestedTimeZone.length <= 100) {
        try {
            timeZone = new Intl.DateTimeFormat('en-US', {
                timeZone: requestedTimeZone
            }).resolvedOptions().timeZone
        } catch {
            // Older clients or invalid zones use UTC rather than server-local time.
        }
    }

    const localTime = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        dateStyle: 'full',
        timeStyle: 'long'
    }).format(now)

    return `Current clock reading for this response:
UTC: ${now.toISOString()}
User timezone: ${timeZone}
User local date and time: ${localTime}
Use this fresh reading for questions about the current time, date, or day.
It supersedes old clock statements in conversation history. State the timezone.
This is a snapshot at response generation, not a continuously updating clock.
If the user asks about another location, use its timezone; do not assume it shares the user's timezone.`
}
