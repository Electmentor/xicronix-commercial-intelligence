import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const MAX_BODY_CHARS = 16_000;
const CONTACT_EMAIL = "info@xicronix.com";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function multiline(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function isUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function classifyRouting(input: { interest?: string | null; product?: string | null; subject?: string | null; message?: string | null }) {
  const haystack = [input.interest, input.product, input.subject, input.message].filter(Boolean).join(" ").toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => haystack.includes(term));

  if (has("reclamo", "queja", "legal", "privacidad", "datos personales", "libro de reclamaciones")) {
    return { area: "LEGAL", reason: "Consulta legal, privacidad o reclamación" };
  }
  if (has("soporte", "falla", "garantía", "garantia", "mantenimiento", "postventa", "incidencia", "no funciona")) {
    return { area: "SUPPORT", reason: "Soporte, postventa o incidencia" };
  }
  if (has("propuesta", "cotización", "cotizacion", "diagnóstico", "diagnostico", "presupuesto", "costo", "equipamiento", "comprar", "compra")) {
    return { area: "COMMERCIAL", reason: "Solicitud de diagnóstico, propuesta, cotización o compra" };
  }
  if (has("implementación", "implementacion", "instalación", "instalacion", "puesta en marcha", "proyecto en curso", "cronograma", "coordinación", "coordinacion")) {
    return { area: "PROJECTS", reason: "Implementación o coordinación de proyecto" };
  }
  return { area: "COMMERCIAL", reason: "Nueva oportunidad, cotización o consulta comercial" };
}

function isEmail(value: string | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}
function institutionType(value: string | null) {
  const v=(value||"").toLowerCase();
  if(v.includes("coleg")||v.includes("school")) return "SCHOOL";
  if(v.includes("univers")) return "UNIVERSITY";
  if(v.includes("instit")) return "INSTITUTE";
  if(v.includes("hospital")) return "HOSPITAL";
  if(v.includes("clín")||v.includes("clinic")) return "CLINIC";
  if(v.includes("gob")||v.includes("municip")) return "GOVERNMENT";
  if(v.includes("investig")) return "RESEARCH_CENTER";
  if(v.includes("empresa")||v.includes("company")) return "COMPANY";
  return "OTHER";
}
function acknowledgementCopy(input:{interest?:string|null;area:string}) {
  const interest=(input.interest||"").toLowerCase();
  if(interest.includes("diagn")) return {subject:"Recibimos tu solicitud de diagnóstico en Xicronix",headline:"Recibimos tu solicitud de diagnóstico",paragraph:"Nuestro equipo revisará la información sobre el laboratorio y te responderá desde info@xicronix.com para coordinar el siguiente paso."};
  if(input.area==="SUPPORT") return {subject:"Recibimos tu solicitud de soporte en Xicronix",headline:"Recibimos tu solicitud de soporte",paragraph:"Nuestro equipo revisará la información enviada y te responderá desde info@xicronix.com."};
  return {subject:"Recibimos tu consulta en Xicronix",headline:"Recibimos tu mensaje",paragraph:"Nuestro equipo revisará la información y te responderá desde info@xicronix.com para coordinar el siguiente paso."};
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail(apiKey: string, payload: Record<string, unknown>, idempotencyKey: string) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, result };
}

function submissionContext(input: Record<string, unknown>, request: Record<string, unknown>) {
  const context = request.context && typeof request.context === "object" ? request.context as Record<string, unknown> : {};
  const privacy = input.privacyNotice && typeof input.privacyNotice === "object" ? input.privacyNotice as Record<string, unknown> : {};
  const acknowledgedAt = text(privacy.acknowledgedAt, 40);
  return {
    sourcePage: text(context.sourcePage, 300) ?? null,
    cta: text(context.cta, 120) ?? null,
    channel: context.channel === "web_chat" ? "web_chat" : "web_form",
    emailInformationRequested: context.channel === "web_chat" && context.emailInformationRequested === true,
    privacyNotice: {
      acknowledged: privacy.acknowledged === true,
      version: text(privacy.version, 40) ?? null,
      acknowledgedAt: acknowledgedAt && !Number.isNaN(Date.parse(acknowledgedAt)) ? acknowledgedAt : null,
      purpose: text(privacy.purpose, 500) ?? null
    }
  };
}

Deno.serve(async (req: Request) => {
    const ctx = { supabaseAdmin };
    if (req.method !== "POST") {
      return json({ ok: false, message: "Method not allowed." }, 405);
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return json({ ok: false, message: "Unsupported media type." }, 415);
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_CHARS) {
      return json({ ok: false, message: "Payload too large." }, 413);
    }

    let input: Record<string, unknown>;
    try {
      input = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return json({ ok: false, message: "Invalid JSON." }, 400);
    }

    const leadId = text(input.leadId, 36);
    const source = text(input.source, 80);
    const submittedAt = text(input.submittedAt, 40);
    const contact = input.contact && typeof input.contact === "object" ? input.contact as Record<string, unknown> : {};
    const request = input.request && typeof input.request === "object" ? input.request as Record<string, unknown> : {};
    const attribution = input.attribution && typeof input.attribution === "object" ? input.attribution as Record<string, unknown> : {};

    const name = text(contact.name, 100);
    const email = text(contact.email, 180)?.toLowerCase();
    const message = multiline(request.message, 4000);

    if (!isUuid(leadId) || source !== "xicronix-web" || !submittedAt || Number.isNaN(Date.parse(submittedAt))) {
      return json({ ok: false, message: "Invalid lead envelope." }, 400);
    }

    if (!name || name.length < 2 || !isEmail(email) || !message || message.length < 15) {
      return json({ ok: false, message: "Invalid lead content." }, 400);
    }

    const context = submissionContext(input, request);
    if (!context.privacyNotice.acknowledged || !context.privacyNotice.version || !context.privacyNotice.acknowledgedAt ||
        (context.channel === "web_chat" && !context.emailInformationRequested)) {
      return json({ ok: false, message: "Privacy acknowledgement is required." }, 400);
    }
    // Check the durable receipt before throttling. Retries never re-send emails.
    async function existingReceipt() {
      const { data, error } = await ctx.supabaseAdmin.from("web_leads")
        .select("public_reference,email,name,message,sync_status,acknowledgement_status,internal_alert_status")
        .eq("external_lead_id", leadId).maybeSingle();
      if (error) return json({ ok: false }, 503);
      if (!data) return null;
      if (data.email !== email || data.name !== name || data.message !== message) return json({ ok: false, message: "Request conflict." }, 409);
      return json({ ok: true, duplicate: true, reference: data.public_reference, synced: data.sync_status === "synced", acknowledgement: data.acknowledgement_status, internalAlert: data.internal_alert_status });
    }
    const previous = await existingReceipt();
    if (previous) return previous;
    const { count, error: countError } = await ctx.supabaseAdmin.from("web_leads")
      .select("id", { count: "exact", head: true }).eq("email", email)
      .gte("received_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (countError) return json({ ok: false }, 503);
    if ((count ?? 0) >= 3) return json({ ok: false, message: "Daily request limit reached." }, 429);

    const routing = classifyRouting({
      interest: text(request.interest, 60) ?? null,
      product: text(request.product, 180) ?? null,
      message
    });

    const row = {
      external_lead_id: leadId,
      environment: "production",
      source,
      submission_context: context,
      submitted_at: new Date(submittedAt).toISOString(),
      name,
      role: text(contact.role, 120) ?? null,
      institution: text(contact.institution, 160) ?? null,
      institution_type: text(contact.institutionType, 100) ?? null,
      email,
      phone: text(contact.phone, 40) ?? null,
      interest: text(request.interest, 60) ?? null,
      product: text(request.product, 180) ?? null,
      message,
      page_path: text(attribution.landingPath, 300) ?? null,
      referrer_host: text(attribution.referrerHost, 253)?.toLowerCase() ?? null,
      utm_source: text(attribution.utmSource, 120) ?? null,
      utm_medium: text(attribution.utmMedium, 120) ?? null,
      utm_campaign: text(attribution.utmCampaign, 180) ?? null,
      utm_content: text(attribution.utmContent, 180) ?? null,
      utm_term: text(attribution.utmTerm, 180) ?? null,
      status: "new",
      sync_status: "pending",
      internal_alert_status: "pending",
      acknowledgement_status: "pending",
      routing_area: routing.area,
      routing_reason: routing.reason,
      routing_updated_at: new Date().toISOString()
    };

    const { data: savedLead, error: insertError } = await ctx.supabaseAdmin
      .from("web_leads")
      .insert(row)
      .select("id,external_lead_id,public_reference")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return (await existingReceipt()) || json({ ok: false }, 409);
      }
      console.error("web_lead_insert_failed", { code: insertError.code });
      return json({ ok: false, message: "Could not persist lead." }, 500);
    }

    const webLeadRowId = savedLead.id as string;
    const publicReference = savedLead.public_reference as string;
    let syncStatus = "failed";
    let crmLeadId: string | null = null;
    let syncError: string | null = null;
    let organizationId: string | null = null;

    try {
      const { data: org } = await ctx.supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("slug", "xicronix")
        .maybeSingle();

      const { data: adminProfile } = await ctx.supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("organization_id", org?.id ?? "")
        .eq("role", "ADMIN")
        .limit(1)
        .maybeSingle();

      if (org?.id) {
        organizationId = org.id;
        const titleParts=[row.institution||name,row.interest||"Consulta web"].filter(Boolean);
        const {data:canonicalTask}=await ctx.supabaseAdmin.from("tasks").select("due_at").eq("organization_id",org.id).eq("automation_key",`cx:web:${webLeadRowId}`).maybeSingle();
        const attentionDueAt=canonicalTask?.due_at||new Date(new Date(row.submitted_at).getTime()+24*60*60*1000).toISOString();
        let institutionId:string|null=null;
        if(row.institution){
          const {data:existingInstitution}=await ctx.supabaseAdmin.from("institutions").select("id,name").eq("organization_id",org.id).ilike("name",row.institution).limit(1).maybeSingle();
          if(existingInstitution?.id) institutionId=existingInstitution.id as string;
          else {
            const {data:createdInstitution,error:institutionError}=await ctx.supabaseAdmin.from("institutions").insert({organization_id:org.id,name:row.institution,type:institutionType(row.institution_type),country:"Peru",created_by:adminProfile?.id??null}).select("id").single();
            if(institutionError) throw institutionError; institutionId=createdInstitution.id as string;
          }
        }
        let contactId:string|null=null;
        const {data:existingContact}=await ctx.supabaseAdmin.from("contacts").select("id,institution_id").eq("organization_id",org.id).ilike("email",email).limit(1).maybeSingle();
        if(existingContact?.id){
          contactId=existingContact.id as string;
          if(!existingContact.institution_id&&institutionId) await ctx.supabaseAdmin.from("contacts").update({institution_id:institutionId}).eq("id",contactId);
        } else {
          const nameParts=name.trim().split(/\s+/); const firstName=nameParts.shift()||name; const lastName=nameParts.join(" ")||null;
          const {data:createdContact,error:contactError}=await ctx.supabaseAdmin.from("contacts").insert({organization_id:org.id,institution_id:institutionId,first_name:firstName,last_name:lastName,job_title:row.role,decision_level:"UNKNOWN",email,phone:row.phone,created_by:adminProfile?.id??null}).select("id").single();
          if(contactError) throw contactError; contactId=createdContact.id as string;
        }
        const {data:crmLead,error:crmError}=await ctx.supabaseAdmin.from("leads").insert({organization_id:org.id,institution_id:institutionId,contact_id:contactId,title:[...titleParts,publicReference].join(" · "),source:"WEBSITE",status:"NEW",score:25,next_action:"Revisar la solicitud y realizar la primera respuesta humana.",next_action_date:attentionDueAt,attention_due_at:attentionDueAt,routing_area:routing.area,routing_reason:routing.reason,owner_user_id:adminProfile?.id??null,created_by:adminProfile?.id??null}).select("id").single();
        if(crmError) throw crmError; crmLeadId=crmLead.id as string;
        const {error:activityError}=await ctx.supabaseAdmin.from("activities").insert({organization_id:org.id,institution_id:institutionId,contact_id:contactId,lead_id:crmLeadId,type:"WEB_FORM",subject:(context.channel === "web_chat" ? "Solicitud desde el chat · contexto revisado por el visitante" : "Solicitud inicial recibida por formulario web") + " · " + publicReference,notes:message,need_summary:row.interest||null,created_by:adminProfile?.id??null,occurred_at:row.submitted_at});
        if(activityError) throw activityError;
        syncStatus="synced";
      } else {
        syncError = "Organization not found";
      }
    } catch (error) {
      syncError = error instanceof Error ? error.message.slice(0, 500) : "CRM sync failed";
    }

    await ctx.supabaseAdmin.from("web_leads").update({
      sync_status: syncStatus,
      crm_record_id: crmLeadId,
      sync_error: syncError,
      synced_at: syncStatus === "synced" ? new Date().toISOString() : null
    }).eq("id", webLeadRowId);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    let internalAlertStatus = "not_required";
    let acknowledgementStatus = "not_required";
    let notificationError: string | null = null;
    let acknowledgementEmailId: string | null = null;

    if (resendKey) {
      try {
        const { data: admins } = await ctx.supabaseAdmin
          .from("profiles")
          .select("id,full_name")
          .eq("role", "ADMIN").eq("organization_id", organizationId ?? "00000000-0000-0000-0000-000000000000");

        const recipients: string[] = [];
        for (const admin of admins || []) {
          const user = await ctx.supabaseAdmin.auth.admin.getUserById(admin.id);
          const adminEmail = user?.data?.user?.email;
          if (adminEmail) recipients.push(adminEmail);
        }

        const uniqueRecipients = [...new Set(recipients)];

        if (uniqueRecipients.length) {
          const manageUrl = crmLeadId
            ? `https://xicronix-commercial-intelligence.vercel.app/?lead=${encodeURIComponent(crmLeadId)}`
            : "https://xicronix-commercial-intelligence.vercel.app/";

          const alertText = [
            "NUEVO LEAD WEB - XICRONIX",
            "",
            `Referencia: ${publicReference}`,
            `Nombre: ${name}`,
            `Institución: ${row.institution || "No indicada"}`,
            `Cargo: ${row.role || "No indicado"}`,
            `Correo: ${email}`,
            `Teléfono: ${row.phone || "No indicado"}`,
            `Interés: ${row.interest || "No indicado"}`,
            `Producto: ${row.product || "No indicado"}`,
            "",
            message,
            "",
            `Gestionar: ${manageUrl}`
          ].join("\n");

          const alertHtml = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;color:#13233a"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px"><table width="100%" style="max-width:640px;background:#fff;border:1px solid #dde4ec;border-radius:14px"><tr><td style="padding:28px"><p style="font-size:12px;font-weight:700;color:#1677ff">NUEVO LEAD WEB · XICRONIX</p><h1 style="font-size:24px;margin:0 0 18px">${esc(row.institution || name)}</h1><p><strong>Referencia:</strong> ${esc(publicReference)}</p><p><strong>Contacto:</strong> ${esc(name)}</p><p><strong>Cargo:</strong> ${esc(row.role || "No indicado")}</p><p><strong>Correo:</strong> ${esc(email)}</p><p><strong>Teléfono:</strong> ${esc(row.phone || "No indicado")}</p><p><strong>Interés:</strong> ${esc(row.interest || "No indicado")}</p><p><strong>Producto:</strong> ${esc(row.product || "No indicado")}</p><p style="margin-top:20px"><strong>Mensaje</strong><br>${esc(message).replaceAll("\n","<br>")}</p><p style="margin-top:24px"><a href="${manageUrl}" style="background:#0a84e8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block">Abrir Commercial Intelligence</a></p></td></tr></table></td></tr></table></body></html>`;

          const alert = await sendEmail(resendKey, {
            from: `Xicronix <${CONTACT_EMAIL}>`,
            to: uniqueRecipients,
            reply_to: email,
            subject: `Nuevo lead web: ${row.institution || name}`,
            text: alertText,
            html: alertHtml
          }, `web-lead-alert-${leadId}`);

          internalAlertStatus = alert.ok ? "sent" : "failed";
          if (!alert.ok) notificationError = `internal_alert_${alert.status}`;
        } else {
          internalAlertStatus = "failed";
          notificationError = "no_internal_recipient";
        }

        const acknowledgement=acknowledgementCopy({interest:row.interest,area:routing.area});
        const acknowledgementText=[`Hola ${name},`,"",acknowledgement.headline+".",acknowledgement.paragraph,"","No necesitas enviar nuevamente la información.","","Xicronix","Ciencia, tecnología e innovación",CONTACT_EMAIL].join("\n");
        const acknowledgementHtml=`<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;color:#13233a"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px"><table width="100%" style="max-width:620px;background:#fff;border:1px solid #dde4ec;border-radius:14px"><tr><td style="padding:30px"><p style="font-size:12px;font-weight:700;color:#1677ff">XICRONIX · CONTACTO</p><h1 style="font-size:24px;margin:0 0 18px">${esc(acknowledgement.headline)}</h1><p>Hola ${esc(name)},</p><p>${esc(acknowledgement.paragraph)}</p><p>No necesitas enviar nuevamente la información.</p><p style="margin-top:28px;padding-top:18px;border-top:1px solid #dde4ec;color:#5c6b7a">Xicronix<br>Ciencia, tecnología e innovación<br>${CONTACT_EMAIL}</p></td></tr></table></td></tr></table></body></html>`;
        const information = context.emailInformationRequested ? chatInformationEmail(name!, publicReference, routing.area) : null;
        const ack=await sendEmail(resendKey,{from:`Xicronix <${CONTACT_EMAIL}>`,to:[email],reply_to:CONTACT_EMAIL,subject:information?.subject ?? acknowledgement.subject,text:information?.text ?? acknowledgementText,html:information?.html ?? acknowledgementHtml},`web-lead-ack-${leadId}`);

        acknowledgementStatus = ack.ok ? "sent" : "failed";
        acknowledgementEmailId = ack.ok && typeof ack.result.id === "string" ? ack.result.id : null;
        if (!ack.ok && !notificationError) notificationError = `acknowledgement_${ack.status}`;
      } catch (error) {
        internalAlertStatus = internalAlertStatus === "sent" ? "sent" : "failed";
        acknowledgementStatus = acknowledgementStatus === "sent" ? "sent" : "failed";
        notificationError = error instanceof Error ? error.message.slice(0, 500) : "Notification workflow failed";
      }
    } else {
      notificationError = "RESEND_API_KEY not configured";
    }

    await ctx.supabaseAdmin.from("web_leads").update({
      internal_alert_status: internalAlertStatus,
      acknowledgement_status: acknowledgementStatus,
      notification_error: notificationError,
      notifications_updated_at: new Date().toISOString()
      ,submission_context: { ...context, acknowledgementEmailId }
    }).eq("id", webLeadRowId);

    return json({
      ok: true,
      reference: publicReference,
      synced: syncStatus === "synced",
      internalAlert: internalAlertStatus,
      acknowledgement: acknowledgementStatus
    }, 201);
});

// Only approved public content goes to the visitor; never model text or CRM data.
function chatInformationEmail(name: string, reference: string, area: string) {
  const links = area === "LEGAL"
    ? [["Libro de reclamaciones", "https://www.xicronix.com/libro-de-reclamaciones"], ["Privacidad", "https://www.xicronix.com/politica-de-privacidad"]]
    : area === "SUPPORT"
    ? [["Contacto y soporte", "https://www.xicronix.com/contacto"], ["Recursos", "https://www.xicronix.com/recursos"]]
    : [["Soluciones para tu institución", "https://www.xicronix.com/soluciones"], ["Equipamiento científico", "https://www.xicronix.com/equipamiento"], ["Recursos y orientación", "https://www.xicronix.com/recursos"]];
  const intro = "Recibimos la solicitud que autorizaste desde nuestro asistente digital. Aquí tienes información oficial para continuar. El equipo podrá revisar el contexto que compartiste; este correo no confirma una cotización, una reserva ni una llamada.";
  const hours = "Atención humana de referencia: lunes a sábado, de 8:00 a. m. a 6:00 p. m., hora de Lima. Domingos sin atención humana. Feriados y citas sujetos a confirmación.";
  return {
    subject: "Tu solicitud e información de Xicronix",
    text: [`Hola ${name},`, "", intro, "", ...links.map(([label,url]) => `${label}: ${url}`), "", `Referencia: ${reference}`, "", hours, "", "Puedes responder a este correo para ampliar tu consulta. No necesitas registrar la solicitud otra vez.", "Xicronix · info@xicronix.com"].join("\n"),
    html: `<!doctype html><html lang="es"><head><title>Tu solicitud en Xicronix</title></head><body style="font-family:Arial,sans-serif;background:#f6f8fb;color:#13233a;padding:24px"><main style="max-width:620px;margin:auto;background:#fff;padding:28px;border-radius:14px"><h1 style="font-size:24px">Continuemos con tu consulta</h1><p>Hola ${esc(name)},</p><p>${intro}</p><ul>${links.map(([label,url]) => `<li style="margin:12px 0"><a href="${url}">${label}</a></li>`).join("")}</ul><p><strong>Referencia:</strong> ${esc(reference)}</p><p>${hours}</p><p>Puedes responder a este correo para ampliar tu consulta. No necesitas registrar la solicitud otra vez.</p><p>Xicronix<br>info@xicronix.com</p></main></body></html>`
  };
}
