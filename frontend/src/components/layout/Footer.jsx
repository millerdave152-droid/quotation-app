import React from 'react';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const links = [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Support', href: '/support' },
    { label: 'Contact Us', href: '/contact' },
  ];

  return (
    <footer style={{
      background: '#374151',
      color: '#9ca3af',
      padding: '16px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '16px',
    }}>
      {/* Left: Copyright */}
      <div style={{
        fontSize: '13px',
      }}>
        &copy; {currentYear} TELETIME. All rights reserved.
      </div>

      {/* Right: Links */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        {links.map((link, index) => (
          <React.Fragment key={link.href}>
            {index > 0 && (
              <span style={{ color: '#6b7280' }}>|</span>
            )}
            <a
              href={link.href}
              style={{
                color: '#9ca3af',
                textDecoration: 'none',
                fontSize: '13px',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => e.target.style.color = '#ffffff'}
              onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
            >
              {link.label}
            </a>
          </React.Fragment>
        ))}
      </nav>
    </footer>
  );
};

export default Footer;
