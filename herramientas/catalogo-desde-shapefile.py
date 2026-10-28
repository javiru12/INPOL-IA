#!/usr/bin/env python3
"""
Saca el catálogo electoral de un estado (municipios, distritos y
secciones) del Marco Geográfico del INE y lo deja en JSON para que
`db/cargar-geografia.mts` lo suba a la base.

    python3 herramientas/catalogo-desde-shapefile.py <carpeta> <clave> <nombre>

La geometría va por otro lado (`geo-desde-shapefile.py`): aquí solo
salen claves y nombres, que es lo que vive en la base. El centroide sí
se calcula aquí porque sale de la misma lectura y se usa para centrar el
mapa en cada municipio.
"""
import json
import os
import sys

import shapefile
from pyproj import Transformer


def codificacion(base):
    try:
        with open(base + '.cpg', encoding='ascii') as f:
            return f.read().strip() or 'latin-1'
    except OSError:
        return 'latin-1'


def abrir(carpeta, archivo):
    base = os.path.join(carpeta, archivo)
    lector = shapefile.Reader(base, encoding=codificacion(base))
    with open(base + '.prj', encoding='latin-1') as f:
        tr = Transformer.from_crs(f.read(), 'EPSG:4326', always_xy=True)
    campos = [c[0] for c in lector.fields[1:]]
    return lector, tr, campos


def centro(forma, tr):
    """Centro de la caja envolvente: basta para colocar una etiqueta."""
    if not forma.points:
        return None, None
    x0, y0, x1, y1 = forma.bbox
    lon, lat = tr.transform((x0 + x1) / 2, (y0 + y1) / 2)
    return round(lat, 7), round(lon, 7)


def main():
    carpeta, clave, nombre = os.path.expanduser(sys.argv[1]), sys.argv[2].zfill(2), sys.argv[3]
    salida = {'estado': {'clave': clave, 'nombre': nombre},
              'municipios': [], 'distritos': [], 'secciones': []}

    lector, tr, campos = abrir(carpeta, 'MUNICIPIO')
    for r, f in zip(lector.records(), lector.shapes()):
        d = dict(zip(campos, r))
        if str(d['entidad']).zfill(2) != clave:
            continue
        lat, lon = centro(f, tr)
        salida['municipios'].append({
            'clave': str(d['municipio']).zfill(3),
            'nombre': (d.get('nombre') or '').strip(),
            'latitud': lat, 'longitud': lon,
        })
    lector.close()

    for archivo, ambito, campo in [('DISTRITO_LOCAL', 'local', 'distrito_l'),
                                   ('DISTRITO_FEDERAL', 'federal', 'distrito_f')]:
        lector, tr, campos = abrir(carpeta, archivo)
        for r, f in zip(lector.records(), lector.shapes()):
            d = dict(zip(campos, r))
            if str(d['entidad']).zfill(2) != clave:
                continue
            lat, lon = centro(f, tr)
            salida['distritos'].append({
                'ambito': ambito,
                'clave': str(d[campo]).zfill(2),
                'latitud': lat, 'longitud': lon,
            })
        lector.close()

    lector, tr, campos = abrir(carpeta, 'SECCION')
    for r, f in zip(lector.records(), lector.shapes()):
        d = dict(zip(campos, r))
        if str(d['entidad']).zfill(2) != clave:
            continue
        lat, lon = centro(f, tr)
        salida['secciones'].append({
            'clave': str(d['seccion']).zfill(4),
            'municipio': str(d['municipio']).zfill(3),
            'distrito_local': str(d['distrito_l']).zfill(2),
            'distrito_federal': str(d['distrito_f']).zfill(2),
            'tipo': (str(d.get('tipo') or '').strip() or None),
            'latitud': lat, 'longitud': lon,
        })
    lector.close()

    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'db', 'geografia')
    os.makedirs(raiz, exist_ok=True)
    ruta = os.path.join(raiz, f'{clave}.json')
    with open(ruta, 'w', encoding='utf-8') as fh:
        json.dump(salida, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'  {nombre}: {len(salida["municipios"])} municipios · '
          f'{len(salida["distritos"])} distritos · {len(salida["secciones"])} secciones')


if __name__ == '__main__':
    main()
