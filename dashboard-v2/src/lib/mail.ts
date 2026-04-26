import { BrevoClient } from '@getbrevo/brevo';

const brevo = new BrevoClient({ 
    apiKey: process.env.BREVO_API_KEY || ''
});

export const sendVerificationEmail = async (email: string, token: string) => {
  try {
    // Lead Engineer Note: Fallback to console for easier local debugging if key is placeholder
    if (!process.env.BREVO_API_KEY && !brevo) {
      console.warn('⚠️ BREVO_API_KEY missing. Verification token for', email, 'is:', token);
      return;
    }

    const result = await brevo.transactionalEmails.sendTransacEmail({
      subject: "Career-Ops Identity Verification",
      htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
            body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; background-color: #faf9f6; }
            .container { max-width: 600px; margin: 40px auto; padding: 60px 40px; background-color: #ffffff; border: 1px solid #e7e5e4; border-radius: 40px; }
            .logo { width: 56px; height: 56px; background-color: #1c1917; border-radius: 16px; margin: 0 auto 40px auto; display: flex; align-items: center; justify-content: center; }
            .headline { font-size: 32px; font-weight: 700; color: #1c1917; text-align: center; margin-bottom: 12px; letter-spacing: -0.025em; }
            .subtext { font-size: 16px; color: #78716c; text-align: center; margin-bottom: 48px; line-height: 1.5; }
            .otp-box { background-color: #faf9f6; border: 1px solid #e7e5e4; padding: 40px; border-radius: 32px; text-align: center; margin-bottom: 48px; }
            .otp-code { font-size: 52px; font-weight: 700; color: #1c1917; letter-spacing: 12px; margin-left: 12px; }
            .footer { border-top: 1px solid #f5f5f4; margin-top: 60px; padding-top: 32px; text-align: center; }
            .footer-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: #a8a29e; }
            .notice { font-size: 12px; color: #a8a29e; line-height: 1.6; margin-bottom: 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <h1 class="headline">Verify Identity</h1>
            <p class="subtext">Enter the secure authentication code below to activate your Career-Ops dashboard and begin your agentic career scan.</p>
            
            <div class="otp-box">
              <span class="otp-code">${token}</span>
            </div>
            
            <div class="footer">
              <p class="notice">If you did not request this code, your identity remains secure. You can safely discard this transmission.</p>
              <div style="margin-top: 24px;">
                <span class="footer-tag">SaaS Infrastructure v2.0-modern</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      sender: { "name": "Career-Ops", "email": "akashkaintura.ak@gmail.com" },
      to: [{ "email": email }]
    });
    
    console.log('OTP Email sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Failed to send OTP Email:', error);
    // Lead Engineer: Do NOT crash the registration flow if email fails. 
    // Log it and allow the user to see the "Check your email" page so they can try "Resend".
    return null; 
  }
};
