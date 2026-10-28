/**
 * A dónde puede ir un archivo que alguien sube.
 *
 * Vive aparte y sin dependencias del servidor porque lo leen los dos
 * lados: la pantalla para dibujar el mapeo de columnas y la acción para
 * saber qué tabla y qué campos tocar.
 *
 * `sinonimos` es lo que hace que el mapeo se adivine solo. Los archivos
 * llegan con los encabezados que les puso quien los exportó —CURP,
 * curp, CVE_CURP, Clave Única— y obligar a mapear doce columnas a mano
 * cada vez es la diferencia entre que se use y que no.
 */

export type CampoDestino = {
  clave: string
  etiqueta: string
  requerido?: boolean
  tipo?: 'texto' | 'numero' | 'fecha' | 'curp'
  sinonimos: string[]
}

export type Destino = {
  clave: string
  etiqueta: string
  descripcion: string
  tabla: string
  /** Lleva datos personales: exige declarar con qué derecho se tratan. */
  personal: boolean
  campos: CampoDestino[]
}

export const DESTINOS: Destino[] = [
  {
    clave: 'ciudadanos',
    etiqueta: 'Padrón de ciudadanos',
    descripcion: 'Personas, para darlas de alta o completar las que ya están.',
    tabla: 'ciudadanos',
    personal: true,
    campos: [
      { clave: 'curp', etiqueta: 'CURP', requerido: true, tipo: 'curp', sinonimos: ['curp', 'clave unica', 'cve_curp'] },
      { clave: 'nombre', etiqueta: 'Nombre(s)', sinonimos: ['nombre', 'nombres', 'nom_aseg', 'nombre completo'] },
      { clave: 'apellido_paterno', etiqueta: 'Apellido paterno', sinonimos: ['apellido paterno', 'paterno', 'ap_paterno', 'primer apellido'] },
      { clave: 'apellido_materno', etiqueta: 'Apellido materno', sinonimos: ['apellido materno', 'materno', 'ap_materno', 'segundo apellido'] },
      { clave: 'telefono_movil', etiqueta: 'Celular', sinonimos: ['celular', 'telefono', 'movil', 'tel movil', 'tel'] },
      { clave: 'colonia', etiqueta: 'Colonia', sinonimos: ['colonia', 'col', 'asentamiento', 'nuevocpo'] },
      { clave: 'codigo_postal', etiqueta: 'Código postal', sinonimos: ['cp', 'codigo postal', 'cod_post'] },
      { clave: 'seccion_clave', etiqueta: 'Sección electoral', sinonimos: ['seccion', 'seccion electoral', 'secc'] },
      { clave: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha', sinonimos: ['fecha de nacimiento', 'nacimiento', 'fec_nac', 'f_nac'] },
      { clave: 'sexo', etiqueta: 'Sexo', sinonimos: ['sexo', 'genero'] },
    ],
  },
  {
    clave: 'ext_telefonos',
    etiqueta: 'Teléfonos por CURP',
    descripcion: 'Padrón de teléfonos para cruzar con las fichas existentes.',
    tabla: 'ext_telefonos',
    personal: true,
    campos: [
      { clave: 'curp', etiqueta: 'CURP', requerido: true, tipo: 'curp', sinonimos: ['curp', 'clave unica'] },
      { clave: 'telefono', etiqueta: 'Teléfono', requerido: true, sinonimos: ['telefono', 'celular', 'movil', 'tel movil', 'tel', 'numero'] },
      { clave: 'tipo', etiqueta: 'Tipo', sinonimos: ['tipo', 'tipo de linea', 'clase'] },
    ],
  },
  {
    clave: 'ext_vehiculos',
    etiqueta: 'Placas y licencias por CURP',
    descripcion: 'Registro vehicular, para cruzar por CURP.',
    tabla: 'ext_vehiculos',
    personal: true,
    campos: [
      { clave: 'curp', etiqueta: 'CURP', requerido: true, tipo: 'curp', sinonimos: ['curp', 'clave unica'] },
      { clave: 'placa', etiqueta: 'Placa', sinonimos: ['placa', 'placas', 'matricula'] },
      { clave: 'licencia', etiqueta: 'Licencia', sinonimos: ['licencia', 'num_licencia', 'folio licencia'] },
      { clave: 'tipo_vehiculo', etiqueta: 'Tipo de vehículo', sinonimos: ['tipo', 'tipo vehiculo', 'clase', 'servicio'] },
      { clave: 'modelo', etiqueta: 'Modelo', tipo: 'numero', sinonimos: ['modelo', 'anio', 'year'] },
    ],
  },
  {
    clave: 'ext_buro_credito',
    etiqueta: 'Historial crediticio por CURP',
    descripcion: 'Nivel y puntaje. Exige autorización expresa de cada persona (LRSIC art. 28).',
    tabla: 'ext_buro_credito',
    personal: true,
    campos: [
      { clave: 'curp', etiqueta: 'CURP', requerido: true, tipo: 'curp', sinonimos: ['curp', 'clave unica'] },
      { clave: 'nivel', etiqueta: 'Nivel', sinonimos: ['nivel', 'categoria', 'rango'] },
      { clave: 'score', etiqueta: 'Puntaje', tipo: 'numero', sinonimos: ['score', 'puntaje', 'calificacion'] },
    ],
  },
  {
    clave: 'ext_curp_zona',
    etiqueta: 'CURP y zona electoral',
    descripcion: 'En qué municipio o sección ubica a cada persona su credencial.',
    tabla: 'ext_curp_zona',
    personal: true,
    campos: [
      { clave: 'curp', etiqueta: 'CURP', requerido: true, tipo: 'curp', sinonimos: ['curp', 'clave unica'] },
      { clave: 'municipio_clave', etiqueta: 'Clave de municipio', sinonimos: ['municipio', 'cve_mun', 'clave municipio', 'mun'] },
      { clave: 'seccion_clave', etiqueta: 'Sección electoral', sinonimos: ['seccion', 'secc', 'seccion electoral'] },
    ],
  },
  {
    clave: 'ext_salario_region',
    etiqueta: 'Salario promedio por región',
    descripcion:
      'Agregado por distrito o municipio. Un promedio no identifica a nadie, así que no pide base legal.',
    tabla: 'ext_salario_region',
    personal: false,
    campos: [
      { clave: 'distrito_clave', etiqueta: 'Distrito local', sinonimos: ['distrito', 'distrito local', 'dto', 'region'] },
      { clave: 'municipio_clave', etiqueta: 'Clave de municipio', sinonimos: ['municipio', 'cve_mun', 'clave municipio'] },
      { clave: 'salario_promedio', etiqueta: 'Salario promedio', tipo: 'numero', requerido: true, sinonimos: ['salario', 'salario promedio', 'sal_base', 'promedio', 'sueldo'] },
      { clave: 'trabajadores', etiqueta: 'Trabajadores', tipo: 'numero', sinonimos: ['trabajadores', 'asegurados', 'conteo'] },
    ],
  },
]

export function destinoPorClave(c: string | undefined) {
  return DESTINOS.find((d) => d.clave === c) ?? null
}

/** Quita acentos y signos para comparar encabezados con sinónimos. */
export function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Propone qué columna del archivo va a cada campo.
 *
 * Primero busca coincidencia exacta con un sinónimo y solo después que
 * el encabezado contenga al sinónimo: al revés, «telefono» se llevaría
 * la columna «telefono del patron» antes que la de «telefono».
 */
export function proponerMapeo(destino: Destino, encabezados: string[]) {
  const normalizados = encabezados.map(normalizar)
  const mapeo: Record<string, number> = {}
  const usadas = new Set<number>()

  // Tres pasadas, de la más estricta a la más laxa, y cada campo se
  // queda con la columna en la pasada más estricta donde encaje. Al
  // revés, «telefono» se llevaría «telefono del patron» antes que
  // «telefono», que es el que de verdad quería.
  //
  // La tercera compara palabra por palabra: los exports traen
  // encabezados como TEL_MOVIL o NOM_ASEG, que no contienen al sinónimo
  // completo pero comparten una palabra con él.
  for (const paso of [0, 1, 2]) {
    for (const campo of destino.campos) {
      if (mapeo[campo.clave] !== undefined) continue
      for (let i = 0; i < normalizados.length; i++) {
        if (usadas.has(i)) continue
        const h = normalizados[i]
        const pega = campo.sinonimos.some((s) => {
          const n = normalizar(s)
          if (paso === 0) return h === n
          if (paso === 1) return h.includes(n) || n.includes(h)
          const palabrasH = h.split(' ')
          return n.split(' ').some((x) => x.length >= 3 && palabrasH.includes(x))
        })
        if (pega) {
          mapeo[campo.clave] = i
          usadas.add(i)
          break
        }
      }
    }
  }
  return mapeo
}
