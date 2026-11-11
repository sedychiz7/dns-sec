import crypto from 'node:crypto';

function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function uuidFrom(seed: string): string {
  const h = crypto.createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
}

/**
 * Builds an Apple configuration profile (.mobileconfig) that turns on
 * encrypted DNS (DoH) system-wide on iPhone, iPad and Mac. Parents tap one
 * link, then "Install" in Settings - no typing IP addresses.
 *
 * For App Store distribution, sign the profile with your Apple Developer
 * certificate so it shows as "Verified".
 */
export function buildAppleProfile(opts: {
  brand: string;
  dnsId: string;
  dohUrl: string;
  displayName: string;
  serverAddresses: string[];
}): string {
  const id = `com.${opts.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}.dns.${opts.dnsId}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>${xml(opts.dohUrl)}</string>
${
  opts.serverAddresses.length
    ? `        <key>ServerAddresses</key>
        <array>
${opts.serverAddresses.map((a) => `          <string>${xml(a)}</string>`).join('\n')}
        </array>
`
    : ''
}      </dict>
      <key>PayloadDisplayName</key>
      <string>${xml(opts.brand)} Safe DNS</string>
      <key>PayloadIdentifier</key>
      <string>${id}.settings</string>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key>
      <string>${uuidFrom(`${opts.dnsId}:settings`)}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Blocks harmful sites on this device using ${xml(opts.brand)}.</string>
  <key>PayloadDisplayName</key>
  <string>${xml(opts.brand)} - ${xml(opts.displayName)}</string>
  <key>PayloadIdentifier</key>
  <string>${id}</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${uuidFrom(opts.dnsId)}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}
