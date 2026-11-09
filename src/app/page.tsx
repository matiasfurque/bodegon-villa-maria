import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock, Instagram, MapPin, Utensils } from "lucide-react";
import { prisma } from "@/lib/prisma";
import PublicMenu from "./public-menu";

export const dynamic = "force-dynamic";

const locationQuery = encodeURIComponent("Lisandro de la Torre 2331, Mataderos, CABA");

export default async function HomePage() {
  let menuDisponible = true;
  const categorias = await prisma.categoriaProducto
    .findMany({
      where: { estado: { visibleEnMenu: true, habilitado: true } },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        productos: {
          where: {
            estado: { permiteVenta: true },
            visibilidad: { visibleEnMenu: true }
          },
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true, descripcion: true, precio: true }
        }
      }
    })
    .catch(() => {
      menuDisponible = false;
      return [];
    });

  return (
    <main className="public-shell">
      <nav className="topbar">
        <div className="brand">Bodegon Villa Maria</div>
        <div className="nav-actions">
          <a className="btn ghost" href="#menu">
            <Utensils size={18} /> Menu
          </a>
          <Link className="btn ghost" href="/login">
            Ingresar
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Bodegon & cafeteria · Mataderos</p>
          <h1>Villa Maria</h1>
          <p>
            Un espacio con alma portena para comer rico, compartir y quedarse un rato mas.
            Platos de bodegon, cafeteria y encuentros sociales en Lisandro de la Torre.
          </p>
          <div className="nav-actions">
            <a className="btn primary" href="#menu">
              Ver menu
            </a>
            <a className="btn ghost" href="#contacto">
              Contacto
            </a>
          </div>
        </div>
      </section>

      <section id="menu" className="public-section">
        <div className="section-head">
          <div>
            <p className="digital-menu-eyebrow">Nuestra carta</p>
            <h2>Menú digital</h2>
            <p className="muted">Elegí una categoría y descubrí los sabores de Villa María.</p>
          </div>
        </div>
        {!menuDisponible ? (
          <div className="panel public-empty-state">
            <h3>Menu no disponible momentaneamente</h3>
            <p className="muted">Estamos actualizando la carta. Probá nuevamente en unos minutos.</p>
          </div>
        ) : (
          <PublicMenu categorias={categorias.map((categoria) => ({
            id: categoria.id,
            nombre: categoria.nombre,
            productos: categoria.productos.map((producto) => ({
              id: producto.id,
              nombre: producto.nombre,
              descripcion: producto.descripcion,
              precio: producto.precio?.toString() ?? null
            }))
          }))} />
        )}
      </section>

      <section id="contacto" className="public-section contact-section">
        <div className="contact-intro">
          <p className="contact-eyebrow">Encontranos</p>
          <h2>Nos vemos en Villa María</h2>
          <p>Te esperamos en Mataderos para compartir un buen momento.</p>
        </div>

        <div className="contact-feature-grid">
          <article className="contact-location-card">
            <div className="contact-location-head">
              <span className="contact-location-icon"><MapPin size={24} aria-hidden="true" /></span>
              <div>
                <p className="contact-card-label">Ubicación</p>
                <h3>Vení al bodegón</h3>
              </div>
            </div>
            <div className="contact-map">
              <iframe
                title="Mapa de Bodegón Villa María en Lisandro de la Torre 2331"
                src={`https://www.google.com/maps?q=${locationQuery}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <div className="contact-location-footer">
              <p>Lisandro de la Torre 2331, Mataderos, CABA.</p>
              <a
                className="contact-link contact-map-link"
                href={`https://www.google.com/maps/search/?api=1&query=${locationQuery}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Cómo llegar <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </div>
          </article>

          <article className="contact-instagram-card">
            <div className="contact-instagram-top">
              <span className="contact-instagram-icon"><Instagram size={32} aria-hidden="true" /></span>
              <span>Seguinos de cerca</span>
            </div>
            <div>
              <p className="contact-card-label">Instagram</p>
              <h3>@villamaria.mtd</h3>
              <p className="contact-instagram-description">Descubrí nuestros platos, encuentros y momentos del bodegón.</p>
            </div>
            <a
              className="contact-link contact-instagram-link"
              href="https://www.instagram.com/villamaria.mtd/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visitar Instagram <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </article>
        </div>

        <div className="contact-info-grid">
          <article className="contact-info-card">
            <Clock size={23} aria-hidden="true" />
            <div>
              <h3>Horarios</h3>
              <p>Martes a viernes de 9 a 15 hs. Sabados y domingos de 9 hs en adelante.</p>
            </div>
          </article>
          <article className="contact-info-card">
            <CalendarDays size={23} aria-hidden="true" />
            <div>
              <h3>Encuentros</h3>
              <p>Espacio de encuentro social, eventos, meriendas y propuestas culturales.</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
