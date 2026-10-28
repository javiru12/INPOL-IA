import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Para abrir el sistema desde el celular o de otra máquina de la red, que
  // llegan por la IP y no por localhost. Solo afecta al servidor de desarrollo.
  allowedDevOrigins: ['192.168.1.112'],

  experimental: {
    // El límite de fábrica es 1 MB y un Excel de padrón lo pasa sin
    // esfuerzo: la carga moría con un 500 sin mensaje. Se sube a 8 MB,
    // que es hasta donde llega el camino de subir el archivo entero.
    //
    // Más alto no sirve: Vercel corta el cuerpo de cualquier petición
    // en 4.5 MB, así que por encima de eso el tope manda el servidor y
    // no esta línea. Por eso el CSV y el DBF no suben: los lee el
    // navegador y manda lotes.
    serverActions: { bodySizeLimit: '8mb' },
  },
};

export default nextConfig;
