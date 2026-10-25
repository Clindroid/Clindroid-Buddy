declare global {
  const CLINBUDDY_VERSION: string
  const CLINBUDDY_CHANNEL: string
}

export const InstallationVersion = typeof CLINBUDDY_VERSION === "string" ? CLINBUDDY_VERSION : "local"
export const InstallationChannel = typeof CLINBUDDY_CHANNEL === "string" ? CLINBUDDY_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
