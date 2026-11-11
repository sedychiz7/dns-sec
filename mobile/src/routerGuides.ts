/**
 * Plain-English, brand-specific steps for the one thing parents ever need to
 * do in their router: paste two DNS addresses. Menu names drift between
 * firmware versions, so keep wording forgiving and update from support tickets.
 */
export interface RouterGuide {
  id: string;
  name: string;
  /** Where to make the change: an app, or a web address typed in a browser. */
  where: string;
  steps: string[];
  /** Some ISP gateways lock DNS settings - steer those users to per-device setup. */
  limited?: string;
}

export const ROUTER_GUIDES: RouterGuide[] = [
  {
    id: 'eero',
    name: 'eero',
    where: 'eero app',
    steps: [
      'Open the eero app and tap Settings.',
      'Tap Network settings → DNS.',
      'Choose Custom DNS and paste the two addresses above.',
      'Tap Save. Your eero restarts in about a minute.',
    ],
  },
  {
    id: 'google',
    name: 'Google / Nest Wifi',
    where: 'Google Home app',
    steps: [
      'Open the Google Home app and tap Wi-Fi.',
      'Tap the gear (Network settings) → Advanced networking → DNS.',
      'Choose Custom and paste the two addresses above.',
      'Tap Save.',
    ],
  },
  {
    id: 'tplink',
    name: 'TP-Link / Deco',
    where: 'Tether or Deco app (or tplinkwifi.net)',
    steps: [
      'Deco: open the Deco app → More → Advanced → IPv4 → DNS Address → Custom.',
      'Archer routers: open tplinkwifi.net → Advanced → Network → Internet.',
      'Paste the two addresses above as Primary and Secondary DNS.',
      'Tap Save.',
    ],
  },
  {
    id: 'netgear',
    name: 'NETGEAR / Orbi',
    where: 'routerlogin.net (or orbilogin.com)',
    steps: [
      'In a browser on your Wi-Fi, open routerlogin.net (Orbi: orbilogin.com).',
      'Sign in with the admin password on the router sticker.',
      'Go to Internet (Basic → Internet).',
      'Under Domain Name Server (DNS) Address choose "Use These DNS Servers".',
      'Paste the two addresses above and click Apply.',
    ],
  },
  {
    id: 'asus',
    name: 'ASUS',
    where: 'ASUS Router app (or router.asus.com)',
    steps: [
      'Open router.asus.com and sign in.',
      'Go to WAN → Internet Connection.',
      'Set "Connect to DNS Server automatically" to No.',
      'Paste the two addresses above as DNS Server 1 and 2, then Apply.',
    ],
  },
  {
    id: 'linksys',
    name: 'Linksys / Velop',
    where: 'myrouter.local',
    steps: [
      'Open myrouter.local in a browser and sign in.',
      'Go to Connectivity → Internet Settings → Edit.',
      'Paste the two addresses above as DNS 1 and DNS 2.',
      'Click Apply.',
    ],
  },
  {
    id: 'xfinity',
    name: 'Xfinity gateway',
    where: 'Xfinity app',
    steps: ['Xfinity gateways do not let you change DNS.'],
    limited:
      "Xfinity's gateway locks this setting. Protect each child's device instead (takes 1 minute each), or plug a mesh system like eero into the gateway.",
  },
  {
    id: 'att',
    name: 'AT&T gateway',
    where: '192.168.1.254',
    steps: ['Most AT&T gateways do not let you change DNS.'],
    limited:
      "AT&T gateways usually lock this setting. Protect each child's device instead, or add your own Wi-Fi router behind the gateway.",
  },
  {
    id: 'spectrum',
    name: 'Spectrum',
    where: 'My Spectrum app',
    steps: ['Spectrum-supplied routers do not let you change DNS.'],
    limited:
      "Spectrum's router locks this setting. Protect each child's device instead, or use your own Wi-Fi router.",
  },
  {
    id: 'other',
    name: 'Something else',
    where: 'Your router app or admin page',
    steps: [
      'Look on the router sticker for an app name or an address like 192.168.0.1 and the admin password.',
      'Find a setting called DNS (often under Internet, WAN or Advanced).',
      'Switch it from Automatic to Manual / Custom.',
      'Paste the two addresses above and save.',
    ],
  },
];
