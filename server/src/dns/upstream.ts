import dgram from 'node:dgram';
import net from 'node:net';
import dnsPacket from 'dns-packet';

/**
 * Removes EDNS Client Subnet from a query before it leaves our network so the
 * upstream resolver (and every authoritative server behind it, including ad
 * networks) never learns which neighbourhood the family is in.
 */
export function stripClientSubnet(packet: dnsPacket.Packet): dnsPacket.Packet {
  if (!packet.additionals) return packet;
  for (const rr of packet.additionals) {
    if (rr.type === 'OPT' && Array.isArray((rr as dnsPacket.OptAnswer).options)) {
      const opt = rr as dnsPacket.OptAnswer;
      opt.options = opt.options.filter((o) => o.code !== 8 && (o as { type?: string }).type !== 'CLIENT_SUBNET');
    }
  }
  return packet;
}

function queryUdp(server: string, msg: Buffer, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket(net.isIPv6(server) ? 'udp6' : 'udp4');
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`upstream ${server} timed out`));
    }, timeoutMs);
    socket.once('message', (res) => {
      clearTimeout(timer);
      socket.close();
      resolve(res);
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
    socket.send(msg, 53, server);
  });
}

function queryTcp(server: string, msg: Buffer, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: server, port: 53 });
    const chunks: Buffer[] = [];
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error(`upstream ${server} timed out (tcp)`));
    });
    socket.on('connect', () => socket.write(dnsPacket.streamEncode(dnsPacket.decode(msg))));
    socket.on('data', (d) => {
      chunks.push(d);
      const all = Buffer.concat(chunks);
      if (all.length >= 2 && all.length >= 2 + all.readUInt16BE(0)) {
        socket.end();
        resolve(all.subarray(2, 2 + all.readUInt16BE(0)));
      }
    });
    socket.on('error', reject);
  });
}

export class Upstream {
  constructor(
    private servers: string[],
    private timeoutMs: number,
  ) {}

  /** Sends a query to the first healthy upstream; retries over TCP if the answer is truncated. */
  async query(packet: dnsPacket.Packet): Promise<Buffer> {
    const msg = dnsPacket.encode(stripClientSubnet(packet));
    let lastErr: unknown;
    for (const server of this.servers) {
      try {
        let res = await queryUdp(server, msg, this.timeoutMs);
        const decoded = dnsPacket.decode(res);
        if ((decoded.flags ?? 0) & dnsPacket.TRUNCATED_RESPONSE) {
          res = await queryTcp(server, msg, this.timeoutMs);
        }
        return res;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error('no upstreams configured');
  }

  /** Resolves a hostname to records of one type (used for SafeSearch CNAME targets). */
  async resolve(name: string, type: 'A' | 'AAAA'): Promise<dnsPacket.Answer[]> {
    const res = await this.query({
      type: 'query',
      id: Math.floor(Math.random() * 65535),
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type, name, class: 'IN' }],
    });
    return (dnsPacket.decode(res).answers ?? []).filter((a) => a.type === type);
  }
}
