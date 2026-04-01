import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getDueReminders, markReminderSent } from '@nutricoach/core';

const MEAL_REMINDER_POOL = [
  '🍽️ ¡Hora de comer! Mandame una foto de tu comida y te cuento los macros 📸',
  '🕐 Se acerca tu hora de comer, {{name}}! Después avisame qué comiste 😄',
  'Che {{name}}, ya casi es hora de tu comida. Acordate de registrarla! 🍴',
  '{{name}}, ¿ya pensaste qué vas a comer? Mandame la foto después 📸',
  '¡Hola {{name}}! Tu comida se acerca 🕐 Después contame qué comiste!',
];

const WATER_REMINDER_POOL = [
  '💧 ¿Ya tomaste agua? Acordate de hidratarte bien hoy',
  '{{name}}, ¿cómo vas con el agua? Tomá un vasito ahora 💦',
  '¡Hidratación check! 💧 ¿Cuánta agua llevás hoy, {{name}}?',
  'Che {{name}}, no te olvides del agua 💧 Es clave para tus objetivos',
];

const WEIGH_IN_REMINDER_POOL = [
  '⚖️ ¡Hora de pesarte! Mandame tu peso de hoy',
  '{{name}}, ¿te pesaste hoy? Mandame el número para registrarlo ⚖️',
  'Buen momento para subirte a la balanza, {{name}}! ⚖️',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildReminderMessage(type: string, name: string, label?: string | null): string {
  let template: string;
  if (type === 'meal') {
    template = pickRandom(MEAL_REMINDER_POOL);
  } else if (type === 'water') {
    template = pickRandom(WATER_REMINDER_POOL);
  } else if (type === 'weigh_in') {
    template = pickRandom(WEIGH_IN_REMINDER_POOL);
  } else {
    template = label || 'Recordatorio';
  }
  return template.replace(/\{\{name\}\}/g, name);
}

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

    const name = reminder.first_name || 'crack';
    const body = buildReminderMessage(reminder.type, name, reminder.label);

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
