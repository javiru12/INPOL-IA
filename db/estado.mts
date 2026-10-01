/** Radiografía rápida de la base local: npm run db:estado */
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })

const tablas = await sql<{ tabla: string; filas: number; rls: boolean }[]>`
  select c.relname as tabla,
         c.reltuples::bigint as filas,
         c.relrowsecurity as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname`

const roles = await sql`select rolname from pg_roles where rolname like 'inpol%' order by 1`

console.log(`\n  ${tablas.length} tabla(s)\n`)
for (const t of tablas) {
  console.log(`  ${t.rls ? 'RLS' : '   '}  ${t.tabla.padEnd(34)} ${t.filas < 0 ? '?' : t.filas}`)
}
console.log(`\n  Roles: ${roles.map((r) => r.rolname).join(', ')}\n`)
await sql.end()
