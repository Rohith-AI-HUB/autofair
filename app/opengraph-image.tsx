import { ImageResponse } from 'next/og';

export const alt =
  'AutoFair — verified used cars in Bengaluru with the full inspection dossier published before you call the seller.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0b1726',
          padding: '76px 80px',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 20,
              height: 20,
              background: '#16b8a6',
              display: 'flex',
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#7eddd1',
            }}
          >
            AutoFair
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', fontSize: 88, lineHeight: 1.05, fontWeight: 800 }}>
            Know the car before
          </div>
          <div style={{ display: 'flex', fontSize: 88, lineHeight: 1.05, fontWeight: 800 }}>
            you buy it.
          </div>
          <div style={{ display: 'flex', fontSize: 34, color: '#9fb2c5', lineHeight: 1.35 }}>
            Verified used cars. Inspection file, documents and
          </div>
          <div style={{ display: 'flex', fontSize: 34, color: '#9fb2c5', lineHeight: 1.35 }}>
            disclosed history — published, not promised.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '2px solid #1b3350',
            paddingTop: 26,
          }}
        >
          <div style={{ display: 'flex', fontSize: 28, color: '#7eddd1', letterSpacing: 2 }}>
            autofair.online
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#9fb2c5' }}>
            Bengaluru · by appointment
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
