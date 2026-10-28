/* DealBriz SEO Engine */
(function(){
  const SITE_NAME = 'DealBriz';
  const SITE_URL = 'https://dealbriz.com';
  const DEFAULT_IMAGE = SITE_URL + '/og-image.png';
  const DEFAULT_DESC = 'DealBriz is India\'s trusted marketplace to buy and sell used cars, bikes, phones, furniture, electronics & more locally. Safe, simple, and near you.';
  const DEFAULT_TITLE = 'Buy & Sell Used Products Near You | DealBriz';

  const SEO_CONFIG = {
    home: { title: DEFAULT_TITLE, description: DEFAULT_DESC, type: 'website', priority: '1.0' },
    buy: { title: 'Buy Used Products Online Near You | DealBriz', description: 'Browse second-hand cars, bikes, mobiles, laptops, furniture, electronics & more on DealBriz. Find great deals near you.', type: 'website' },
    mydeals: { title: 'My Deals | DealBriz', description: 'Track your deals, offers and loan status on DealBriz.', type: 'website', noindex: true },
    profile: { title: 'My Profile | DealBriz', description: 'Manage your DealBriz profile, listings and account settings.', type: 'website', noindex: true },
    mylistings: { title: 'My Listings | DealBriz', description: 'Manage your listings on DealBriz.', type: 'website', noindex: true },
    myads: { title: 'Saved Ads | DealBriz', description: 'Your saved listings on DealBriz.', type: 'website', noindex: true },
    mychats: { title: 'Messages | DealBriz', description: 'Your conversations on DealBriz.', type: 'website', noindex: true },
    emiStatus: { title: 'EMI Status | DealBriz', description: 'Check your EMI application status.', type: 'website', noindex: true },
    'emi-status': { title: 'EMI Status | DealBriz', description: 'Check your EMI application status.', type: 'website', noindex: true },
    admin: { title: 'Admin Panel | DealBriz', description: 'DealBriz Admin Panel.', type: 'website', noindex: true },
    lender: { title: 'Lender Portal | DealBriz', description: 'DealBriz Lender Portal.', type: 'website', noindex: true },
    help: { title: 'Help & Support | DealBriz', description: 'Get help with buying, selling, deals, and account on DealBriz.', type: 'website' },
    contact: { title: 'Contact Us | DealBriz', description: 'Contact DealBriz support for help and queries.', type: 'website' },
    reportProblem: { title: 'Report a Problem | DealBriz', description: 'Report issues or problems to DealBriz support.', type: 'website', noindex: true },
    partners: { title: 'Partners | DealBriz', description: 'DealBriz partners and financing options.', type: 'website' },
    blog: { title: 'Blog | DealBriz', description: 'DealBriz blog - tips for buying and selling used products.', type: 'website' },
    legal: { title: 'Legal | DealBriz', description: 'DealBriz terms of service and privacy policy.', type: 'website' }
  };

  function ensureMeta(selector, attr, val){
    let el = document.querySelector(selector);
    if(!el){
      el = document.createElement('meta');
      if(attr === 'name') el.setAttribute('name', val);
      else if(attr === 'property') el.setAttribute('property', val);
      else el.setAttribute(attr, val.split('=')[0]);
      document.head.appendChild(el);
    }
    return el;
  }

  function ensureLink(rel){
    let el = document.querySelector('link[rel="'+rel+'"]');
    if(!el){
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    return el;
  }

  function updateSEO(page){
    try {
      const key = (page || 'home').toLowerCase();
      const cfg = SEO_CONFIG[key] || SEO_CONFIG.home;
      const title = cfg.title || DEFAULT_TITLE;
      const desc = cfg.description || DEFAULT_DESC;
      const url = SITE_URL + '/' + (key === 'home' ? '' : key === 'emi-status' ? 'emi-status' : key);
      const image = cfg.image || DEFAULT_IMAGE;
      const type = cfg.type || 'website';

      document.title = title;

      let metaDesc = document.querySelector('meta[name="description"]');
      if(!metaDesc){ metaDesc = document.createElement('meta'); metaDesc.setAttribute('name','description'); document.head.appendChild(metaDesc); }
      metaDesc.setAttribute('content', desc);

      let robots = document.querySelector('meta[name="robots"]');
      if(!robots){ robots = document.createElement('meta'); robots.setAttribute('name','robots'); document.head.appendChild(robots); }
      if(cfg.noindex){ robots.setAttribute('content','noindex, nofollow'); }
      else { robots.setAttribute('content','index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'); }

      let canonical = document.querySelector('link[rel="canonical"]');
      if(!canonical){ canonical = document.createElement('link'); canonical.setAttribute('rel','canonical'); document.head.appendChild(canonical); }
      canonical.setAttribute('href', url);

      // OG
      const ogTags = [
        ['property','og:title', title],
        ['property','og:description', desc],
        ['property','og:type', type],
        ['property','og:url', url],
        ['property','og:site_name', SITE_NAME],
        ['property','og:image', image],
        ['property','og:image:width','1200'],
        ['property','og:image:height','630']
      ];
      ogTags.forEach(([attr,k,v])=>{
        let m = document.querySelector('meta['+attr+'="'+k+'"]');
        if(!m){ m = document.createElement('meta'); m.setAttribute(attr,k); document.head.appendChild(m); }
        m.setAttribute('content', v);
      });

      // Twitter
      const twTags = [
        ['name','twitter:card','summary_large_image'],
        ['name','twitter:title', title],
        ['name','twitter:description', desc],
        ['name','twitter:image', image],
        ['name','twitter:site','@dealbriz']
      ];
      twTags.forEach(([attr,k,v])=>{
        let m = document.querySelector('meta['+attr+'="'+k+'"]');
        if(!m){ m = document.createElement('meta'); m.setAttribute(attr,k); document.head.appendChild(m); }
        m.setAttribute('content', v);
      });

      // Inject Organization + WebSite JSON-LD on home
      if(key === 'home'){
        let ld = document.querySelector('#dealbriz-ld-org');
        if(!ld){
          ld = document.createElement('script');
          ld.type = 'application/ld+json';
          ld.id = 'dealbriz-ld-org';
          ld.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "DealBriz",
            "url": SITE_URL,
            "logo": SITE_URL + "/favicon.svg",
            "description": DEFAULT_DESC
          });
          document.head.appendChild(ld);
        }
        let ld2 = document.querySelector('#dealbriz-ld-website');
        if(!ld2){
          ld2 = document.createElement('script');
          ld2.type = 'application/ld+json';
          ld2.id = 'dealbriz-ld-website';
          ld2.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "DealBriz",
            "url": SITE_URL,
            "potentialAction": {
              "@type": "SearchAction",
              "target": SITE_URL + "/buy?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          });
          document.head.appendChild(ld2);
        }
      }
    } catch(e){}
  }

  window.updateSEO = updateSEO;
  // Initialize on load. Not on a listing URL: the server already put that
  // listing's tags in the page, and the app sets them again once it opens.
  if(/^\/item\//.test(location.pathname)){
    // leave the listing's tags alone
  } else if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ updateSEO('home'); });
  } else {
    updateSEO('home');
  }
})();
