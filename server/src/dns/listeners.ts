import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import type { ClientHint, Resolver } from './resolver';

function normalizeIp(ip: string | undefined): string {
  return (ip ?? '').replace(/^::ffff:/, '');
}

/** Classic DNS on UDP - what routers use. Clients are identified by source IP. */
export function startUdp(resolver: Resolver, port: number) {
  for (const type of ['udp4', 'udp6'] as const) {
    const socket = dgram.createSocket({ type, ipv6Only: type === 'udp6' });
    socket.on('message', async (msg, rinfo) => {
      const res = await resolver.handle(msg, { ip: normalizeIp(rinfo.address) });
      if (res.length) socket.send(res, rinfo.port, rinfo.address);
    });
    socket.on('error', (err) => console.error(`[dns ${type}]`, err.message));
    socket.bind(port, type === 'udp4' ? '0.0.0.0' : '::', () => console.log(`DNS ${type} listening on :${port}`));
  }
}

/** Handles length-prefixed DNS messages on a stream (TCP and DNS-over-TLS). */
function serveStream(socket: net.Socket, resolver: Resolver, hint: () => ClientHint) {
  let buf = Buffer.alloc(0);
  socket.setTimeout(30_000, () => socket.destroy());
  socket.on('data', async (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const len = buf.readUInt16BE(0);
      if (buf.length < 2 + len) break;
      const msg = buf.subarray(2, 2 + len);
      buf = buf.subarray(2 + len);
      const res = await resolver.handle(Buffer.from(msg), hint());
      if (!res.length || socket.destroyed) continue;
      const out = Buffer.alloc(2 + res.length);
      out.writeUInt16BE(res.length, 0);
      res.copy(out, 2);
      socket.write(out);
    }
  });
  socket.on('error', () => socket.destroy());
}

export function startTcp(resolver: Resolver, port: number) {
  const server = net.createServer((socket) =>
    serveStream(socket, resolver, () => ({ ip: normalizeIp(socket.remoteAddress) })),
  );
  server.listen(port, () => console.log(`DNS tcp listening on :${port}`));
}

/**
 * DNS-over-TLS. Android's "Private DNS" setting takes a hostname, so each
 * family/child gets "<dnsId>.<dotDomain>" and we read the dnsId from SNI.
 * Requires a wildcard certificate for *.<dotDomain>.
 */
export function startDot(resolver: Resolver, port: number, certFile: string, keyFile: string, dotDomain: string) {
  const server = tls.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, (socket) => {
    const sni = (socket as tls.TLSSocket & { servername?: string }).servername ?? '';
    const dnsId = sni.endsWith(`.${dotDomain}`) ? sni.slice(0, -dotDomain.length - 1) : undefined;
    serveStream(socket, resolver, () => ({ dnsId, ip: normalizeIp(socket.remoteAddress) }));
  });
  server.listen(port, () => console.log(`DNS-over-TLS listening on :${port} (*.${dotDomain})`));
}
