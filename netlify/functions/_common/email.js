import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT = 15000;

const toArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : String(val).split(',').map(v=>v.trim()).filter(Boolean);
};

const encodeSubject = (str = '') => {
  if (!/[\u0080-\uFFFF]/.test(str)) return str;
  const b64 = Buffer.from(str, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
};

const escapeAddress = (addr) => addr.includes('<') ? addr : `<${addr}>`;

const encodeBase64Lines = (input) => {
  const b64 = Buffer.from(input, typeof input === 'string' ? 'utf8' : undefined).toString('base64');
  return b64.replace(/.{1,76}/g, (m) => m + '\r\n').trim();
};

const foldLine = (line) => {
  const max = 75;
  if (Buffer.byteLength(line, 'utf8') <= max) return line;
  const bytes = Buffer.from(line, 'utf8');
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const chunk = bytes.subarray(i, i + max);
    out += chunk.toString('utf8');
    i += chunk.length;
    if (i < bytes.length) out += '\r\n ';
  }
  return out;
};

const escapeICSText = (str = '') =>
  str
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

export const formatICS = ({
  id,
  summary,
  description,
  location,
  start,
  end,
  organizer,
  attendees = [],
}) => {
  const formatDT = (d) => {
    const iso = (d instanceof Date ? d : new Date(d || Date.now())).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return iso.endsWith('Z') ? iso : iso + 'Z';
  };
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//GEP Padel//Matches//ES',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${id || randomUUID()}@geppadel`,
    `DTSTAMP:${formatDT(new Date())}`,
    `DTSTART:${formatDT(start)}`,
    `DTEND:${formatDT(end)}`,
    `SUMMARY:${escapeICSText(summary || 'Partido GEP Padel')}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeICSText(description)}`);
  if (location) lines.push(`LOCATION:${escapeICSText(location)}`);
  if (organizer) lines.push(`ORGANIZER;CN=${escapeICSText(organizer.name || organizer.email || '')}:mailto:${organizer.email}`);
  attendees.filter(a=>a && a.email).forEach((a) => {
    const cn = escapeICSText(a.name || a.email);
    lines.push(`ATTENDEE;CN=${cn};RSVP=FALSE:mailto:${a.email}`);
  });
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
};

class SMTPClient {
  constructor(opts) {
    this.host = opts.host;
    this.port = opts.port;
    this.secure = !!opts.secure;
    this.user = opts.user || '';
    this.pass = opts.pass || '';
    this.requireTLS = opts.requireTLS;
    this.rejectUnauthorized = opts.rejectUnauthorized;
    this.timeout = opts.timeout || DEFAULT_TIMEOUT;
    this.clientName = opts.clientName || os.hostname() || 'localhost';
    this.socket = null;
    this.features = {};
  }

  async connect() {
    const create = this.secure ? tls.connect : net.connect;
    const socket = create.call(null, {
      host: this.host,
      port: this.port,
      servername: this.host,
      rejectUnauthorized: this.rejectUnauthorized,
    });
    this.socket = socket;
    socket.setTimeout(this.timeout, () => {
      socket.destroy(new Error('SMTP connection timeout'));
    });
    await new Promise((resolve, reject) => {
      const onError = (err) => { cleanup(); reject(err); };
      const onReady = () => { cleanup(); resolve(); };
      const readyEvt = this.secure ? 'secureConnect' : 'connect';
      const cleanup = () => {
        socket.removeListener('error', onError);
        socket.removeListener(readyEvt, onReady);
      };
      socket.once('error', onError);
      socket.once(readyEvt, onReady);
    });
    const greet = await this._read();
    if (greet.code !== 220) throw new Error(`SMTP greet failed: ${greet.message}`);
  }

  _read() {
    if (!this.socket) throw new Error('smtp-not-connected');
    return new Promise((resolve, reject) => {
      let buffer = '';
      const socket = this.socket;
      const onData = (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        if (!lines.length) return;
        const last = lines[lines.length - 1];
        const match = last.match(/^(\d{3})([ \-])/);
        if (match && match[2] === ' ') {
          cleanup();
          resolve({ code: Number(match[1]), message: buffer, lines });
        }
      };
      const onError = (err) => { cleanup(); reject(err); };
      const onClose = () => { cleanup(); reject(new Error('SMTP connection closed')); };
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('end', onClose);
        socket.off('close', onClose);
      };
      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('end', onClose);
      socket.once('close', onClose);
    });
  }

  async _command(cmd, expect) {
    const socket = this.socket;
    if (!socket) throw new Error('smtp-not-connected');
    socket.write(cmd + '\r\n', 'utf8');
    const res = await this._read();
    const wants = Array.isArray(expect) ? expect : [expect];
    if (expect && !wants.includes(res.code)) {
      throw new Error(`SMTP command failed (${cmd.split(' ')[0]}): ${res.message}`);
    }
    return res;
  }

  async _ehlo() {
    const res = await this._command(`EHLO ${this.clientName}`, 250);
    const feats = { auth: [] };
    res.lines.slice(1).forEach(line => {
      const txt = line.replace(/^250[- ]/, '').trim();
      const [verb, ...rest] = txt.split(' ');
      const key = verb.toUpperCase();
      if (key === 'AUTH') feats.auth = rest.map(v=>v.trim().toUpperCase());
      else if (key === 'STARTTLS') feats.starttls = true;
      feats[key] = rest.join(' ');
    });
    this.features = feats;
  }

  async _startTLS() {
    if (!this.socket) throw new Error('smtp-not-connected');
    await this._command('STARTTLS', 220);
    const secureSocket = tls.connect({
      socket: this.socket,
      servername: this.host,
      rejectUnauthorized: this.rejectUnauthorized,
    });
    this.socket = secureSocket;
    secureSocket.setTimeout(this.timeout, () => {
      secureSocket.destroy(new Error('SMTP TLS timeout'));
    });
    await new Promise((resolve, reject) => {
      const onError = (err) => { cleanup(); reject(err); };
      const onReady = () => { cleanup(); resolve(); };
      const cleanup = () => {
        secureSocket.removeListener('error', onError);
        secureSocket.removeListener('secureConnect', onReady);
      };
      secureSocket.once('error', onError);
      secureSocket.once('secureConnect', onReady);
    });
    await this._ehlo();
  }

  async _auth() {
    if (!this.user) return;
    const auths = this.features.auth || [];
    if (auths.includes('PLAIN')) {
      const payload = Buffer.from(`\0${this.user}\0${this.pass}`, 'utf8').toString('base64');
      await this._command(`AUTH PLAIN ${payload}`, 235);
    } else if (auths.includes('LOGIN')) {
      await this._command('AUTH LOGIN', 334);
      await this._command(Buffer.from(this.user, 'utf8').toString('base64'), 334);
      await this._command(Buffer.from(this.pass, 'utf8').toString('base64'), 235);
    } else {
      throw new Error('SMTP auth method not supported by server');
    }
  }

  async send({ from, recipients, data }) {
    await this.connect();
    await this._ehlo();
    if (!this.secure && this.features.starttls && this.requireTLS !== false) {
      await this._startTLS();
    }
    await this._auth();
    await this._command(`MAIL FROM:${escapeAddress(from)}`, [250, 251]);
    for (const rcpt of recipients) {
      await this._command(`RCPT TO:${escapeAddress(rcpt)}`, [250, 251]);
    }
    const socket = this.socket;
    if (!socket) throw new Error('smtp-not-connected');
    socket.write('DATA\r\n', 'utf8');
    const ready = await this._read();
    if (ready.code !== 354) throw new Error(`SMTP DATA not accepted: ${ready.message}`);
    const normalized = data.endsWith('\r\n') ? data : data + '\r\n';
    const safeData = normalized.replace(/\r\n\./g, '\r\n..');
    socket.write(safeData + '.\r\n', 'utf8');
    const sent = await this._read();
    if (sent.code !== 250) throw new Error(`SMTP message rejected: ${sent.message}`);
    try {
      await this._command('QUIT', [221, 250]);
    } catch (_) {
      /* ignore */
    }
    socket.destroy();
  }
}

export async function sendMail(options) {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  if (!host) throw new Error('SMTP_HOST not configured');
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const requireTLS = (process.env.SMTP_REQUIRE_TLS || '').toLowerCase() !== 'false';
  const rejectUnauthorized = (process.env.SMTP_TLS_REJECT || 'true').toLowerCase() !== 'false';
  const clientName = process.env.SMTP_CLIENT_NAME || undefined;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  const to = toArray(options.to);
  const cc = toArray(options.cc);
  const bcc = toArray(options.bcc);
  const recipients = [...new Set([...to, ...cc, ...bcc])];
  if (!recipients.length) throw new Error('No recipients provided');

  const fromAddr = options.from || process.env.SMTP_FROM || process.env.MAIL_FROM || 'julio@gepgroup.es';

  const headers = [];
  headers.push(`From: ${fromAddr}`);
  if (to.length) headers.push(`To: ${to.join(', ')}`);
  if (cc.length) headers.push(`Cc: ${cc.join(', ')}`);
  headers.push(`Subject: ${encodeSubject(options.subject || '')}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push(`Message-ID: <${randomUUID()}@${host}>`);
  headers.push('MIME-Version: 1.0');
  if (options.replyTo) headers.push(`Reply-To: ${options.replyTo}`);

  const attachments = options.attachments || [];
  const hasHtml = !!options.html;
  const hasAlt = hasHtml && options.text;
  const boundaryMain = attachments.length ? `----=_GEP_${randomUUID()}` : null;
  const boundaryAlt = hasAlt ? `----=_GEP_ALT_${randomUUID()}` : null;

  let body = '';
  if (attachments.length) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMain}"`);
    body += `--${boundaryMain}\r\n`;
    if (hasAlt) {
      headers.push('');
      body += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n`;
      body += `--${boundaryAlt}\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.text || ''}\r\n`;
      body += `--${boundaryAlt}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.html}\r\n`;
      body += `--${boundaryAlt}--\r\n`;
    } else {
      body += `Content-Type: ${options.html ? 'text/html' : 'text/plain'}; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.html || options.text || ''}\r\n`;
    }
    attachments.forEach((att) => {
      body += `--${boundaryMain}\r\n`;
      body += `Content-Type: ${att.contentType || 'application/octet-stream'}\r\n`;
      body += 'Content-Transfer-Encoding: base64\r\n';
      body += `Content-Disposition: attachment; filename="${att.filename || 'file'}"\r\n\r\n`;
      body += `${encodeBase64Lines(att.content)}\r\n`;
    });
    body += `--${boundaryMain}--`;
  } else if (hasAlt) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    body += `--${boundaryAlt}\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.text || ''}\r\n`;
    body += `--${boundaryAlt}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.html}\r\n`;
    body += `--${boundaryAlt}--`;
  } else {
    headers.push(`Content-Type: ${options.html ? 'text/html' : 'text/plain'}; charset="utf-8"`);
    headers.push('Content-Transfer-Encoding: 8bit');
    headers.push('');
    body += options.html || options.text || '';
  }

  if (!headers.includes('')) headers.push('');
  const data = headers.join('\r\n') + (body ? '\r\n' + body : '\r\n');

  const client = new SMTPClient({
    host,
    port,
    secure,
    user,
    pass,
    requireTLS,
    rejectUnauthorized,
    clientName,
  });
  await client.send({ from: fromAddr, recipients, data });
}
