import { Resend } from "resend";

const RESEND_FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";
const EMAIL_SUBJECT = "Tu invitación a OpenDayCare";
const SEND_ERROR = "No se pudo enviar el correo. Intenta de nuevo.";

interface InvitationEmailParams {
  to: string;
  parentName: string;
  childName: string;
  code: string;
  activateUrl: string;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName.trim();
}

function invitationHtml({ parentName, childName, code, activateUrl }: InvitationEmailParams): string {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#F6ECDF;padding:32px 0">
  <div style="max-width:520px;margin:0 auto;background:#FFFDF9;border-radius:16px;padding:32px">
    <h1 style="color:#C5503A;font-size:22px;margin:0 0 16px">OpenDayCare</h1>
    <p style="color:#3E352D;font-size:15px;line-height:1.6;margin:0 0 12px">
      Hola, ${firstName(parentName)}:
    </p>
    <p style="color:#3E352D;font-size:15px;line-height:1.6;margin:0 0 20px">
      La guardería te ha invitado a ver el día de <strong>${childName}</strong>.
      Usa este código para activar tu cuenta:
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <span style="display:inline-block;background:#FBF1D6;border:2px dashed #E6D08A;border-radius:12px;padding:14px 24px;font-size:30px;font-weight:bold;letter-spacing:7px;color:#8A7234">${code}</span>
    </p>
    <p style="text-align:center;color:#A88526;font-size:13px;margin:0 0 24px">Vence en 7 días</p>
    <p style="text-align:center;margin:0 0 24px">
      <a href="${activateUrl}" style="display:inline-block;background:#EE8164;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;border-radius:12px;padding:14px 28px">Activar mi cuenta</a>
    </p>
    <p style="color:#94887B;font-size:12px;margin:0">
      Si no puedes usar el botón, entra en ${activateUrl} e introduce el código.
    </p>
  </div>
</div>`;
}

export async function sendInvitationEmail(
  params: InvitationEmailParams,
): Promise<{ error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { error: SEND_ERROR };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: RESEND_FROM,
    to: params.to,
    subject: EMAIL_SUBJECT,
    html: invitationHtml(params),
  });

  if (error) {
    return { error: SEND_ERROR };
  }

  return {};
}
