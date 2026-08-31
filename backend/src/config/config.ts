import { env } from "./env";

export interface FeatureFlags {
  queueEnabled: boolean;
  clusterEnabled: boolean;
  permessageDeflate: boolean;
  chatPersistence: boolean;
  auditLogging: boolean;
  metricsEnabled: boolean;
}

export interface Config {
  env: typeof env;
  features: FeatureFlags;
}

const features: FeatureFlags = {
  queueEnabled: env.ENABLE_QUEUE,
  clusterEnabled: env.ENABLE_CLUSTER,
  permessageDeflate: env.ENABLE_PERMESSAGE_DEFLATE,
  chatPersistence: env.ENABLE_QUEUE,
  auditLogging: true,
  metricsEnabled: true,
};

export const config: Config = { env, features };

export function getConfig(): Config {
  return config;
}
