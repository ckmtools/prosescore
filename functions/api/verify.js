export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://prosescore.ckmtools.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const sessionId = body.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400, headers: corsHeaders });
    }

    // Retrieve checkout session from Stripe
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
    });

    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 400, headers: corsHeaders });
    }

    const session = await stripeRes.json();
    if (session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: 'Payment not completed' }), { status: 400, headers: corsHeaders });
    }

    // Determine product type from mode
    const isSubscription = session.mode === 'subscription';
    const email = session.customer_details?.email || session.customer_email || '';
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      email: email,
      product: isSubscription ? 'subscription' : 'lifetime',
      iat: now,
      exp: isSubscription ? now + (35 * 24 * 60 * 60) : now + (100 * 365 * 24 * 60 * 60),
    };

    const token = await signToken(payload, env.TOKEN_SECRET);

    return new Response(JSON.stringify({ token, product: payload.product, email: payload.email }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://prosescore.ckmtools.dev',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function signToken(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '');
  const body = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${data}.${sigB64}`;
}
