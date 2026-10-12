import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Para abrir el sistema desde el celular o de otra máquina de la red, que
  // llegan por la IP y no por localhost. Solo afecta al servidor de desarrollo.
  allowedDevOrigins: ['192.168.1.112'],
};

export default nextConfig;
