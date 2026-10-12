
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(email: string, otp: string) {
  const from = process.env.RESEND_FROM_EMAIL;

  if (!process.env.RESEND_API_KEY || !from) {
    throw new Error("Email configuration is missing");
  }

  const safeOtp = otp.replace(/\D/g, "");

  if (safeOtp.length !== 6) {
    throw new Error("OTP must contain exactly 6 digits");
  }

  const { data, error } = await resend.emails.send({
    from,
    to: [email],
    subject: "⚡ Your FITBOOK login code is here",
    text: [
      "You're one step away from FITBOOK!",
      `Your verification code is ${safeOtp}.`,
      "This code expires in 10 minutes.",
      "Never share this code with anyone.",
      "",
      "Made with ❤️ and by Abhinav",
      "Haa haa maine hi banaya hai 😎",
      "",
      "FITBOOK — Show up. Get stronger.",
    ].join("\n"),
    html: `
      <div style="margin:0;padding:32px 16px;background:#101512;font-family:Arial,sans-serif;color:#ffffff;">
        <div style="max-width:480px;margin:0 auto;">
          <div style="font-size:25px;font-weight:800;letter-spacing:2px;color:#c5f36b;">
            ⚡ FITBOOK
          </div>

          <p style="color:#c5f36b;font-size:12px;letter-spacing:2px;">
            YOUR FITNESS. YOUR SESSION.
          </p>

          <h1 style="font-size:30px;line-height:1.2;margin-top:32px;">
            You're one step away. 🚀
          </h1>

          <p style="font-size:16px;line-height:1.7;color:#b7c1b8;">
            Your gym routine isn't going to book itself.
            Enter this verification code to get back into FITBOOK.
          </p>

          <div style="margin:28px 0;padding:28px 16px;text-align:center;
                      background:#202922;border:1px solid #536448;border-radius:16px;">
            <p style="margin:0;color:#c5f36b;font-size:12px;letter-spacing:2px;">
              YOUR ONE-TIME CODE
            </p>

            <div style="margin:20px 0;font-size:38px;font-weight:800;
                        letter-spacing:8px;color:#c5f36b;">
              ${safeOtp}
            </div>

            <p style="margin:0;color:#b7c1b8;font-size:13px;">
              Expires in 10 minutes
            </p>
          </div>

          <p style="font-size:13px;line-height:1.7;color:#b7c1b8;">
            Didn't request this login? Ignore this email.
            Never share your code with anyone.
          </p>

          <div style="margin-top:36px;padding-top:24px;text-align:center;
                      border-top:1px solid #354038;">
            <p style="margin:0 0 10px;font-size:15px;color:#ffffff;">
              Made with ❤️ and ☕ by Abhinav
            </p>

            <p style="margin:0;color:#c5f36b;font-size:15px;font-weight:700;">
              Haa haa maine hi banaya hai 😎
            </p>

            <p style="margin-top:20px;color:#89968c;font-size:11px;letter-spacing:1px;">
              FITBOOK · SHOW UP. GET STRONGER.
            </p>
          </div>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error("OTP email delivery failed:", error.message);
    throw new Error("Unable to send verification email");
  }

  return data;
}
