import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getUserByPhone, isSubscriptionActive } from '@nutricoach/core';

function twiml(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function POST(req: NextRequest) {
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

  try {
    // Parse form-encoded body from Twilio
    const text = await req.text();
    const params = new URLSearchParams(text);
    const body: Record<string, string> = {};
    params.forEach((v, k) => { body[k] = v; });

    // Validate Twilio signature
    const signature = req.headers.get('x-twilio-signature') || '';
    const url = req.url;
    const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, body);

    if (!isValid && process.env.NODE_ENV === 'production') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Extract phone number (strip "whatsapp:" prefix)
    const phone = (body.From || '').replace('whatsapp:', '').trim();

    if (!phone) {
      return twiml('No se pudo identificar tu número.');
    }

    // Look up user in Supabase by phone number
    const user = await getUserByPhone(phone);

    // Check active subscription if user exists
    const hasActiveSub = user ? await isSubscriptionActive(user.id) : false;

    if (!user || !hasActiveSub) {
      // No user or no active subscription → welcome message + onboarding link
      const onboardingUrl = `${APP_URL}/onboarding?phone=${encodeURIComponent(phone)}`;
      return twiml(
        `👋 ¡Hola! Soy tu coach nutricional con IA.\n\n` +
        `Para empezar, completá tu perfil acá:\n${onboardingUrl}`
      );
    }

    // Active subscription → placeholder response
    return twiml('¡Recibí tu mensaje! La función de coach por IA viene pronto.');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return twiml('Hubo un error procesando tu mensaje. Intentá de nuevo en unos minutos.');
  }
}
