/** This web folder is the local review app; reuse ui/ inside the existing Next.js app. */
export default { serverExternalPackages: ['pg'], poweredByHeader: false, devIndicators: false,
  distDir: process.env.GREENREV_NEXT_DIST || '.next' };
