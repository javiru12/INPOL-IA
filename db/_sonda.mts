import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
console.log(JSON.stringify(await sql`select clave, nombre, ambito from distritos where ambito='local' order by clave limit 5`))
console.log(JSON.stringify(await sql`select clave, nombre from municipios order by clave limit 5`))
await sql.end()
