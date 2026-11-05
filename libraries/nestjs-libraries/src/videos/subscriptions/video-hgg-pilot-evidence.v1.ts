/** Retained, root-selected metadata. IDs stay in private evidence, never guessed aliases.
 * Wire compatibility pins do not authorize generation, spending, or a wallet. */
export const HGG_PILOT_EVIDENCE_V1 = Object.freeze({
  schemaDigest: '58a9127974601965209a272cd4503a4c4e843559876604e5fa53f9ac645b685d',
  // Complete owner inventory reviewed 2026-11-05: five ads_studio tools added;
  // all 180 prior tool input/output schemas are unchanged. Historical bindings
  // above remain immutable; native exchanges accept only these reviewed inventories.
  nativeWireSchemaDigests: Object.freeze([
    '58a9127974601965209a272cd4503a4c4e843559876604e5fa53f9ac645b685d',
    '1bb08b39b8ba9f8a8f7dee4d52bc786b5ed4a8592f22dc1454a3929c901d879b',
  ]),
  imageDetail: Object.freeze({sha256: 'd9ebdea01dcdfc04f73463621914e87eb825306aa65c1d437477251d4ed260be', name: 'GPT Image 2.5', provider: 'OpenAI'}),
  videoCatalogue: Object.freeze({sha256: 'fcb4e2a4b5ed0f04989b5e525e9b0eb99358fc0f55a691a8b8dbac215360a9e8', name: 'Kling 4.0', provider: 'Kling'}),
});
