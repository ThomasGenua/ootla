import { icon, link, escapeHtml } from '../lib/ui';
import { publicFloatingIcons } from './public-decoration';

export function exploreSection(): string {
  return '<section class="public-explore detail-cta" data-public-section="explore" aria-labelledby="explore-heading">' + publicFloatingIcons(['home', 'sparkles'], 'explore') + '<div class="detail-container"><span class="detail-kicker">EXPLORE OOTLAAI</span><h2 id="explore-heading">A clearer workspace.<br>A more connected journey.</h2><p>Explore the working demo, follow a workflow and see how OotlaAI can support your property team.</p><div class="detail-hero-links">' + link('/admin/login','Explore demo '+icon('arrow'),'button button-primary') + link('/contact','Contact Ootla','text-link text-link-light') + '</div></div></section>';
}
const photos = {
  residentPhone: {file:'resident-phone.jpg',alt:'A woman seated on a sofa looking at her phone',credit:'Kaboompics.com',provider:'Pexels',url:'https://www.pexels.com/photo/woman-sitting-on-the-sofa-and-using-her-phone-5902273/'},
  propertyTeam: {file:'property-viewing.jpg',alt:'A woman holding a clipboard discussing a home with a couple',credit:'Ivan S',provider:'Pexels',url:'https://www.pexels.com/photo/woman-talking-to-the-couple-while-holding-a-clipboard-8962682/'},
  exterior: {file:'apartment-exterior.jpg',alt:'White apartment facades with glass balconies and turquoise curtains',credit:'Achyut',url:'https://unsplash.com/photos/modern-apartment-building-exterior-with-numerous-windows-and-balconies-lC2Atn-fmow'},
  interior: {file:'apartment-interior.jpg',alt:'A bright furnished living room with seating and an open dining area',credit:'Francesca Tosolini',url:'https://unsplash.com/photos/interior-of-a-living-room-XyGvEj587Mc'},
  neighborhood: {file:'residential-neighborhood.jpg',alt:'Homes and shared green space in a residential neighborhood at dusk',credit:'Srini Somanchi',url:'https://unsplash.com/photos/a-suburban-neighborhood-with-houses-and-trees-at-dusk-GGoGr9MXaSk'},
} as const;
export function publicPhoto(key: keyof typeof photos): string {
  const photo=photos[key],id='photo-credit-'+key,provider='provider' in photo ? photo.provider : 'Unsplash';
  return '<figure class="public-photo public-photo-'+key+'" data-photo-credit tabindex="0" aria-label="Illustrative photograph: '+escapeHtml(photo.alt)+'" aria-describedby="'+id+'"><img src="/photos/'+photo.file+'" alt="'+escapeHtml(photo.alt)+'" width="1440" height="960" loading="lazy" decoding="async"/><figcaption id="'+id+'">Photo: <a href="'+photo.url+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(photo.credit)+' / '+provider+'</a></figcaption></figure>';
}
