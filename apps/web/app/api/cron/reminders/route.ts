import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getDueReminders, markReminderSent } from '@nutricoach/core';

const REMINDER_MESSAGES: Record<string, string> = {
  meal: '🍽️ ¡Hora de comer! Mandame una foto de tu comida y te digo los macros',
  water: '💧 ¿Ya tomaste agua? Acordate de hidratarte',
  weigh_in: '⚖️ ¡Hora de pesarte! Mandame tu peso de hoy',
  custom: '{{label}}',
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const reminders = await getDueReminders();

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );
  const from = 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER!;

  let sent = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const reminder of reminders) {
    if (reminder.last_sent?.startsWith(today)) continue;

    const template = REMINDER_MESSAGES[reminder.type] || REMINDER_MESSAGES.custom;
    const body = template.replace('{{label}}', reminder.label || 'Recordatorio');

    try {
      await client.messages.create({
        from,
        to: 'whatsapp:' + reminder.phone,
        body,
      });
      await markReminderSent(reminder.id);
      sent++;
    } catch (err) {
      console.error(`Failed to send reminder ${reminder.id}:`, err);
    }
  }

  return NextResponse.json({ sent, total: reminders.length });
}
