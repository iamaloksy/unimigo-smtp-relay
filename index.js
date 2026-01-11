// Email Relay Service - HTTP API version (no SMTP ports needed)
import express from "express";

const app = express();
app.use(express.json());

// Environment variables - Using Resend HTTP API
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

if (!RESEND_API_KEY) {
  console.error("❌ Missing required environment variable: RESEND_API_KEY");
  console.log("   Get API key from: https://resend.com/api-keys");
  process.exit(1);
}

if (!EMAIL_FROM) {
  console.error("❌ Missing required environment variable: EMAIL_FROM");
  console.log("   Set this to your verified sender, e.g. noreply@send.kralok.me");
  process.exit(1);
}

app.options("/", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.send();
});

app.post("/", async (req, res) => {
  try {
    const { to, from, fromName, subject, html, replyTo } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({
        error: "Missing required fields: to, subject, html",
      });
    }

    // Enforce sending from your verified domain
    const allowedDomain = EMAIL_FROM.split("@")[1];
    const requestedFrom = from || EMAIL_FROM;
    const requestedDomain = requestedFrom.split("@")[1];
    if (!allowedDomain || requestedDomain !== allowedDomain) {
      return res.status(400).json({
        success: false,
        error: `From address must use your domain (${allowedDomain}). Provided: ${requestedFrom}`,
      });
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
      console.error("❌ Resend API error:", { status: resendResponse.status, body: resendData });
      return res.status(resendResponse.status).json({
        success: false,
        error: resendData.message || "Failed to send email via Resend",
        details: resendData,
      });
    }

    console.log(`✅ Email sent to ${to}`, resendData.id);

    res.header("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      success: true,
      message: "Email sent successfully",
      messageId: resendData.id,
    });
  } catch (error) {
    console.error("❌ Email send error:", error.message);
    res.header("Access-Control-Allow-Origin", "*");
    res.status(500).json({
      success: false,
      error: error.message || "Failed to send email",
    });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`✅ Email Relay (HTTP API) listening on http://localhost:${PORT}`);
  console.log(`   Using Resend API`);
  console.log(`   From: ${EMAIL_FROM}`);
});
