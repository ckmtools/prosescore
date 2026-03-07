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
    const email = (body.email || '').trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400, headers: corsHeaders });
    }

    // Search Stripe customers by email
    const custRes = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=5`, {
      headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
    });

    if (!custRes.ok) {
      return new Response(JSON.stringify({ error: 'Lookup failed' }), { status: 500, headers: corsHeaders });
    }

    const customers = await custRes.json();
    if (!customers.data || customers.data.length === 0) {
      return new Response(JSON.stringify({ error: 'No purchase found for this email' }), { status: 404, headers: corsHeaders });
    }

    // Check each customer for active subscriptions or completed payments
    for (const customer of customers.data) {
      // Check subscriptions
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${customer.id}&status=active&limit=1`, {
        headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
      });

      if (subRes.ok) {
        const subs = await subRes.json();
        if (subs.data && subs.data.length > 0) {
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            email: email,
            product: 'subscription',
            iat: now,
            exp: now + (35 * 24 * 60 * 60),
          };
          const token = await signToken(payload, env.TOKEN_SECRET);
          return new Response(JSON.stringify({ token, product: 'subscription', email }), {
            status: 200, headers: corsHeaders,
          });
        }
      }

      // Check one-time payments (checkout sessions)
      const sessRes = await fetch(`https://api.stripe.com/v1/checkout/sessions?customer=${customer.id}&limit=10`, {
        headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
      });

      if (sessRes.ok) {
        const sessions = await sessRes.json();
        for (const sess of (sessions.data || [])) {
          if (sess.payment_status === 'paid' && sess.mode === 'payment') {
            const now = Math.floor(Date.now() / 1000);
            const payload = {
              email: email,
              product: 'lifetime',
              iat: now,
              exp: now + (100 * 365 * 24 * 60 * 60),
            };
            const token = await signToken(payload, env.TOKEN_SECRET);
            return new Response(JSON.stringify({ token, product: 'lifetime', email }), {
              status: 200, headers: corsHeaders,
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ error: 'No active purchase found for this email' }), { status: 404, headers: corsHeaders });
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
