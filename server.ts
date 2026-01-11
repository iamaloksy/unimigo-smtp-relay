// Email Relay Service - HTTP API version (Deno)
/// <reference lib="deno.window" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmailRequest {
  to: string;
  from?: string;
  fromName?: string;
  subject: string;
  html: string;
  replyTo?: string;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const { to, from, fromName, subject, html, replyTo }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get Resend API credentials from environment
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM");

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }
    if (!EMAIL_FROM) {
      throw new Error("EMAIL_FROM not configured");
    }

    // Enforce sending from your verified domain
    const allowedDomain = EMAIL_FROM.split("@")[1];
    const requestedFrom = from || EMAIL_FROM;
    const requestedDomain = requestedFrom.split("@")[1];
    if (!allowedDomain || requestedDomain !== allowedDomain) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `From address must use your domain (${allowedDomain}). Provided: ${requestedFrom}`
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Use Resend HTTP API
    const emailFrom = requestedFrom;
    const finalFrom = fromName ? `${fromName} <${emailFrom}>` : emailFrom;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: finalFrom,
        to: [to],
        subject,
        html,
        ...(replyTo && { reply_to: replyTo }),
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("❌ Resend API error:", resendData);
      throw new Error(resendData.message || "Failed to send email via Resend");
    }

    console.log(`✅ Email sent to ${to}`, resendData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email sent successfully",
        messageId: resendData.id
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("❌ Email relay error:", error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Failed to send email" 
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
}

Deno.serve({ port: 8000 }, handler);
