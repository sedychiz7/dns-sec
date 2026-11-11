import { Card, H2, P, Screen } from '../src/components/ui';

const FAQ: [string, string][] = [
  [
    'How does it work?',
    'Every time a device opens a website or app, it first looks up the address. KinShield answers those lookups and simply refuses to give out addresses for harmful sites, ads and trackers. Nothing is installed on your kids’ devices and your internet speed is unaffected.',
  ],
  [
    'Whole-home vs one device',
    'Whole-home setup changes one setting on your router and covers everything on your Wi-Fi, including TVs and game consoles. One-device setup protects a phone or tablet everywhere - at school, at friends’ houses and on mobile data.',
  ],
  [
    'How are ads blocked? (Plus)',
    'Ads and tracking are loaded from known ad and analytics servers. KinShield blocks those servers for every device, including smart TVs and apps where normal ad blockers can’t run. It also catches trackers disguised as part of the website you’re visiting, and never shares your location with ad networks.',
  ],
  [
    'Can kids get around it?',
    'Tech-savvy kids can try VPNs or changing settings. Use per-child profiles on their own devices plus Screen Time (iPhone) or Family Link (Android) to lock settings. No filter is perfect - talking with your kids still matters most.',
  ],
  [
    'What do you see?',
    'On Free we only keep counts. On Plus and Pro we keep a short history of website names (not pages or content) so you can see the Activity tab. It’s deleted automatically and never sold.',
  ],
  [
    'A site I need is blocked',
    'Add it to “Always allowed” in Filters → Allow & block specific sites (Plus), or temporarily switch off the category that blocked it.',
  ],
];

export default function Help() {
  return (
    <Screen edges={['bottom']}>
      {FAQ.map(([q, a]) => (
        <Card key={q} style={{ gap: 6 }}>
          <H2>{q}</H2>
          <P muted>{a}</P>
        </Card>
      ))}
    </Screen>
  );
}
