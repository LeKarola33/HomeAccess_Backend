/**
 * HomeAccess - Servicio de Email
 * Ruta: src/services/email.service.js
 *
 * IMPORTANTE: Gmail requiere Contraseña de Aplicación (no la contraseña normal):
 *   1. myaccount.google.com → Seguridad → Verificación en dos pasos (activar)
 *   2. Seguridad → Contraseñas de aplicaciones → Correo → Otro → "HomeAccess"
 *   3. Copiar los 16 caracteres en SMTP_PASS del .env (sin espacios)
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendPasswordResetEmail = async (to, name, token) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl    = `${frontendUrl}/reset-password?token=${token}`;

  await transporter.sendMail({
    from:    process.env.SMTP_FROM || `"HomeAccess" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Recuperación de contraseña — HomeAccess',
    html: `
      <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;
          overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#3b82f6,#2563eb);padding:32px 40px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;">🏠 HomeAccess</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">
              Sistema de Administración Residencial
            </p>
          </div>
          <div style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">
              Recupera tu contraseña
            </h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
              Hola <strong>${name}</strong>, recibimos una solicitud para restablecer
              la contraseña de tu cuenta. Haz clic en el botón para continuar.
            </p>
            <a href="${resetUrl}"
              style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#2563eb);
              color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;
              font-size:15px;font-weight:700;">
              Restablecer contraseña
            </a>
            <div style="margin:28px 0 0;padding:16px;background:#f0f9ff;border-radius:10px;
              border-left:4px solid #3b82f6;">
              <p style="margin:0;color:#1d4ed8;font-size:13px;font-weight:600;">
                ⏱ Este enlace expira en 30 minutos
              </p>
              <p style="margin:6px 0 0;color:#3b82f6;font-size:12px;">
                Si no solicitaste este cambio, ignora este correo.
              </p>
            </div>
            <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">
              Si el botón no funciona, copia este enlace:<br>
              <span style="color:#3b82f6;word-break:break-all;">${resetUrl}</span>
            </p>
          </div>
          <div style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
              © 2026 HomeAccess · Cumple Ley 1581 · Colombia
            </p>
          </div>
        </div>
      </body></html>
    `,
  });
};

module.exports = { sendPasswordResetEmail };
