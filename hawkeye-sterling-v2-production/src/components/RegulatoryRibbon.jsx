import React from 'react';
import { REG_TICKER } from '@/data/constants';

function RegulatoryRibbon() {
  return (
    <div className="reg-ribbon">
      {REG_TICKER.map((item, idx) => (
        <React.Fragment key={idx}>
          <span>
            <span className={`dot ${item.ok ? '' : item.warn ? 'warn' : 'crit'}`}></span>
            {item.text}
          </span>
          {idx < REG_TICKER.length - 1 && <span className="sep">·</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

export default RegulatoryRibbon;
