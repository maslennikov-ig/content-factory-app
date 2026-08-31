const { join } = require('path');
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}', '../../libraries/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Content Factory semantic layer — the only names new components use.
        cf: {
          canvas: 'var(--cf-canvas)',
          surface: 'var(--cf-surface)',
          'surface-subtle': 'var(--cf-surface-subtle)',
          'surface-raised': 'var(--cf-surface-raised)',
          ink: 'var(--cf-ink)',
          'ink-muted': 'var(--cf-ink-muted)',
          'ink-inverse': 'var(--cf-ink-inverse)',
          border: 'var(--cf-border)',
          'border-strong': 'var(--cf-border-strong)',
          'border-control': 'var(--cf-border-control)',
          navigation: 'var(--cf-navigation)',
          'navigation-text': 'var(--cf-navigation-text)',
          'navigation-muted': 'var(--cf-navigation-muted)',
          'navigation-active': 'var(--cf-navigation-active)',
          accent: 'var(--cf-accent)',
          'accent-hover': 'var(--cf-accent-hover)',
          'accent-soft': 'var(--cf-accent-soft)',
          'accent-ink': 'var(--cf-accent-ink)',
          signature: 'var(--cf-signature)',
          info: 'var(--cf-info)',
          'info-soft': 'var(--cf-info-soft)',
          warning: 'var(--cf-warning)',
          'warning-soft': 'var(--cf-warning-soft)',
          danger: 'var(--cf-danger)',
          'danger-soft': 'var(--cf-danger-soft)',
          focus: 'var(--cf-focus)',
        },

        // Inherited names, bridged to the semantic layer in colors.scss.
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        textColor: 'var(--new-btn-text)',
        third: 'var(--color-third)',
        forth: 'var(--color-forth)',
        fifth: 'var(--color-fifth)',
        sixth: 'var(--color-sixth)',
        seventh: 'var(--color-seventh)',
        gray: 'var(--color-gray)',
        input: 'var(--color-input)',
        inputText: 'var(--color-input-text)',
        tableBorder: 'var(--color-table-border)',
        customColor2: 'var(--color-custom2)',
        customColor3: 'var(--color-custom3)',
        customColor4: 'var(--color-custom4)',
        customColor5: 'var(--color-custom5)',
        customColor6: 'var(--color-custom6)',
        customColor7: 'var(--color-custom7)',
        customColor8: 'var(--color-custom8)',
        customColor9: 'var(--color-custom9)',
        customColor10: 'var(--color-custom10)',
        customColor11: 'var(--color-custom11)',
        customColor12: 'var(--color-custom12)',
        customColor13: 'var(--color-custom13)',
        customColor14: 'var(--color-custom14)',
        customColor15: 'var(--color-custom15)',
        customColor16: 'var(--color-custom16)',
        customColor17: 'var(--color-custom17)',
        customColor18: 'var(--color-custom18)',
        customColor19: 'var(--color-custom19)',
        customColor20: 'var(--color-custom20)',
        customColor21: 'var(--color-custom21)',
        customColor22: 'var(--color-custom22)',
        customColor23: 'var(--color-custom23)',
        customColor24: 'var(--color-custom24)',
        customColor25: 'var(--color-custom25)',
        customColor26: 'var(--color-custom26)',
        customColor27: 'var(--color-custom27)',
        customColor28: 'var(--color-custom28)',
        customColor29: 'var(--color-custom29)',
        customColor30: 'var(--color-custom30)',
        customColor31: 'var(--color-custom31)',
        customColor32: 'var(--color-custom32)',
        customColor33: 'var(--color-custom33)',
        customColor34: 'var(--color-custom34)',
        customColor35: 'var(--color-custom35)',
        customColor36: 'var(--color-custom36)',
        customColor37: 'var(--color-custom37)',
        customColor38: 'var(--color-custom38)',
        customColor39: 'var(--color-custom39)',
        customColor40: 'var(--color-custom40)',
        customColor41: 'var(--color-custom41)',
        customColor42: 'var(--color-custom42)',
        customColor43: 'var(--color-custom43)',
        customColor44: 'var(--color-custom44)',
        customColor45: 'var(--color-custom45)',
        customColor46: 'var(--color-custom46)',
        customColor47: 'var(--color-custom47)',
        customColor48: 'var(--color-custom48)',
        customColor49: 'var(--color-custom49)',
        customColor50: 'var(--color-custom50)',
        customColor51: 'var(--color-custom51)',
        customColor52: 'var(--color-custom52)',
        customColor53: 'var(--color-custom53)',
        customColor54: 'var(--color-custom54)',
        customColor55: 'var(--color-custom55)',
        modalCustom: 'var(--color-modalCustom)',

        newBgColor: 'var(--new-bgColor)',
        newBackdrop: 'var(--new-back-drop)',
        newSep: 'var(--new-sep)',
        newBorder: 'var(--new-border)',
        newBgColorInner: 'var(--new-bgColorInner)',
        newBgLineColor: 'var(--new-bgLineColor)',
        textItemFocused: 'var(--new-textItemFocused)',
        textItemBlur: 'var(--new-textItemBlur)',
        boxFocused: 'var(--new-boxFocused)',
        newTextColor: 'rgb(var(--new-textColor) / <alpha-value>)',
        blockSeparator: 'var(--new-blockSeparator)',
        btnSimple: 'var(--new-btn-simple)',
        btnText: 'var(--new-btn-text)',
        btnPrimary: 'var(--new-btn-primary)',
        ai: 'var(--new-ai-btn)',
        boxHover: 'var(--new-box-hover)',
        newTableBorder: 'var(--new-table-border)',
        newTableHeader: 'var(--new-table-header)',
        newTableText: 'var(--new-table-text)',
        newTableTextFocused: 'var(--new-table-text-focused)',
        newColColor: 'var(--new-col-color)',
        newSettings: 'var(--new-settings)',
        menuDots: 'var(--new-menu-dots)',
        menuDotsHover: 'var(--new-menu-hover)',
        bigStrip: 'var(--new-big-strips)',
        popup: 'var(--popup-color)',
        bgLinkedin: 'var(--linkedin-bg)',
        bgFacebook: 'var(--facebook-bg)',
        bgInstagram: 'var(--instagram-bg)',
        bgTiktokItem: 'var(--tiktok-item-bg)',
        bgTiktokItemIcon: 'var(--tiktok-item-icon-bg)',
        bgYoutube: 'var(--youtube-bg)',
        bgCommentFacebook: 'var(--facebook-bg-comment)',
        textLinkedin: 'var(--linkedin-text)',
        borderPreview: 'var(--border-preview)',
        borderLinkedin: 'var(--linkedin-border)',
        youtubeButton: 'var(--youtube-button)',
        youtubeBgAction: 'var(--youtube-action-color)',
        youtubeSvg: 'var(--youtube-svg-border)',
      },
      gridTemplateColumns: {
        13: 'repeat(13, minmax(0, 1fr));',
      },
      fontFamily: {
        sans: ['var(--font-cf-sans)', 'system-ui', 'Arial', 'sans-serif'],
        mono: [
          'var(--font-cf-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      borderRadius: {
        cf: '8px',
        'cf-lg': '12px',
      },
      spacing: {
        sidebar: '248px',
        'sidebar-collapsed': '72px',
      },
      transitionDuration: {
        state: '180ms',
      },
      animation: {
        fade: 'fadeOut 0.5s ease-in-out',
        normalFadeIn: 'normalFadeIn 0.5s ease-in-out',
        fadeIn: 'normalFadeIn 0.2s ease-in-out forwards',
        normalFadeOut: 'normalFadeOut 0.5s linear 5s forwards',
        overflow: 'overFlow 0.5s ease-in-out forwards',
        overflowReverse: 'overFlowReverse 0.5s ease-in-out forwards',
        fadeDown: 'fadeDown 4s ease-in-out forwards',
        normalFadeDown: 'normalFadeDown 0.5s ease-in-out forwards',
        newMessages: 'newMessages 1s ease-in-out 4s forwards',
        marqueeUp: 'marquee-up 100s linear infinite',
        marqueeDown: 'marquee-down 100s linear infinite',
      },
      boxShadow: {
        yellow: '0 0 60px 20px #6b6237',
        yellowToast: '0px 0px 50px rgba(252, 186, 3, 0.3)',
        greenToast: '0px 0px 50px rgba(60, 124, 90, 0.3)',
        menu: 'var(--menu-shadow)',
        previewShadow: 'var(--preview-box-shadow)',
      },
      dropShadow: {
        glow: [
          '0 0 6px rgba(250,204,21,0.6)',
          '0 0 12px rgba(250,204,21,0.5)',
          '0 0 24px rgba(250,204,21,0.4)',
        ],
      },
      // that is actual animation
      keyframes: (theme) => ({
        fadeOut: {
          '0%': {
            opacity: 0,
            transform: 'translateY(30px)',
          },
          '100%': {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
        normalFadeOut: {
          '0%': {
            opacity: 1,
          },
          '100%': {
            opacity: 0,
          },
        },
        normalFadeIn: {
          '0%': {
            opacity: 0,
          },
          '100%': {
            opacity: 1,
          },
        },
        overFlow: {
          '0%': {
            overflow: 'hidden',
          },
          '99%': {
            overflow: 'hidden',
          },
          '100%': {
            overflow: 'visible',
          },
        },
        overFlowReverse: {
          '0%': {
            overflow: 'visible',
          },
          '99%': {
            overflow: 'visible',
          },
          '100%': {
            overflow: 'hidden',
          },
        },
        fadeDown: {
          '0%': {
            opacity: 0,
            marginTop: -30,
          },
          '10%': {
            opacity: 1,
            marginTop: 0,
          },
          '85%': {
            opacity: 1,
            marginTop: 0,
          },
          '90%': {
            opacity: 1,
            marginTop: 10,
          },
          '100%': {
            opacity: 0,
            marginTop: -30,
          },
        },
        normalFadeDown: {
          '0%': {
            opacity: 0,
            transform: 'translateY(-30px)',
          },
          '100%': {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
        newMessages: {
          '0%': {
            backgroundColor: 'var(--color-seventh)',
            fontWeight: 'bold',
          },
          '99%': {
            backgroundColor: 'var(--color-third)',
            fontWeight: 'bold',
          },
          '100%': {
            backgroundColor: 'var(--color-third)',
            fontWeight: 'normal',
          },
        },
      }),
      screens: {
        mobile: {
          raw: '(max-width: 1025px)',
        },
        tablet: {
          raw: '(max-width: 1300px)',
        },
        iconBreak: {
          raw: '(max-width: 1560px)',
        },
        maxMedia: {
          raw: '(max-width: 1400px)',
        },
        minCustom: {
          raw: '(min-height: 800px)',
        },
        custom: {
          raw: '(max-height: 800px)',
        },
        xs: {
          max: '401px',
        },
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar'),
    require('tailwindcss-rtl'),
    function ({ addVariant }) {
      addVariant('child', '& > *');
      addVariant('child-hover', '& > *:hover');
    },

    // The ten typography tokens of DESIGN.md, as one class each. Tailwind's
    // `fontSize` scale cannot carry a family, and these tokens are a family
    // plus size plus weight plus leading plus tracking together — splitting
    // them into separate utilities is how `label-sm` silently ends up on the
    // wrong face.
    function ({ addComponents, addUtilities, theme }) {
      const sans = 'var(--font-cf-sans), system-ui, Arial, sans-serif';
      const mono =
        'var(--font-cf-mono), ui-monospace, SFMono-Regular, monospace';

      // Monospaced tokens ask for a slashed zero. They do not ask for `tnum`:
      // the face is monospaced, so its digits are already tabular, and the
      // font ships no `tnum` feature for the browser to apply.
      const numerals = { fontFeatureSettings: "'zero'" };

      addComponents({
        // The one marketing size. The product scale stops at 32px because a
        // work screen never needs more; a public landing hero does, and the
        // alternative was a hand-typed size inside a component, which is the
        // exact thing `tests/design.typography.test.cjs` exists to refuse. So
        // it is declared here, once, with a name — and it is the only token in
        // this set that carries a breakpoint, because 56px on a 390px screen
        // is not a heading, it is an overflow.
        '.cf-display-xl': {
          fontFamily: sans,
          fontSize: '36px',
          fontWeight: '650',
          lineHeight: '1.08',
          letterSpacing: '-0.03em',
          [`@media (min-width: ${theme('screens.md')})`]: {
            fontSize: '56px',
            lineHeight: '1.04',
            letterSpacing: '-0.035em',
          },
        },
        '.cf-heading-xl': {
          fontFamily: sans,
          fontSize: '32px',
          fontWeight: '650',
          lineHeight: '1.2',
          letterSpacing: '-0.02em',
        },
        '.cf-heading-lg': {
          fontFamily: sans,
          fontSize: '24px',
          fontWeight: '650',
          lineHeight: '1.25',
          letterSpacing: '-0.015em',
        },
        '.cf-heading-md': {
          fontFamily: sans,
          fontSize: '18px',
          fontWeight: '650',
          lineHeight: '1.35',
        },
        '.cf-body-lg': {
          fontFamily: sans,
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '1.55',
        },
        '.cf-body-md': {
          fontFamily: sans,
          fontSize: '14px',
          fontWeight: '400',
          lineHeight: '1.5',
        },
        '.cf-body-sm': {
          fontFamily: sans,
          fontSize: '13px',
          fontWeight: '400',
          lineHeight: '1.45',
        },
        '.cf-label-md': {
          fontFamily: sans,
          fontSize: '13px',
          fontWeight: '650',
          lineHeight: '1.3',
        },
        '.cf-label-sm': {
          fontFamily: mono,
          fontSize: '12px',
          fontWeight: '600',
          lineHeight: '1.3',
          letterSpacing: '0.04em',
          ...numerals,
        },
        '.cf-caption': {
          fontFamily: mono,
          fontSize: '11px',
          fontWeight: '500',
          lineHeight: '1.35',
          letterSpacing: '0.02em',
          ...numerals,
        },
        // The measured number. Same 32px as `heading-xl` and a different face,
        // because the difference between a title and an instrument reading is
        // not size — it is that the digits of one are allowed to move and the
        // digits of the other are not. A recomputed figure set in Geologica
        // reflows its own line; set here it does not, and it stops reading as
        // a heading that happens to be numeric.
        //
        // No breakpoint, unlike `display-xl`: 32px already fits 390px.
        '.cf-display-num': {
          fontFamily: mono,
          fontSize: '32px',
          fontWeight: '600',
          lineHeight: '1.1',
          ...numerals,
        },

      });

      // The pressed state is the single colour value the system allows outside
      // the token palette, and `DESIGN.md` states it once: an inset black, `.14`
      // on a surface and `.22` on a fill. It described a press — light falling
      // into a dent — in two hand-typed copies before it lived here, which is
      // one copy more than a single decision is allowed.
      //
      // `addUtilities`, not `addComponents`, and it writes `--tw-shadow` rather
      // than a bare `box-shadow`. Both matter. A component-layer rule loses to
      // every utility-layer `shadow-*` and `ring-*` on the same element, so a
      // control focused from the keyboard and then pressed would have shown the
      // ring and lost the dent — which is exactly the pairing every control in
      // `choice/` has, since `ControlButton` brings the ring. Composing through
      // the shadow variables is what the hand-typed `active:shadow-[...]` did,
      // and this has to keep doing it.
      const pressed = (alpha) => ({
        '&:active': {
          '--tw-shadow': `inset 0 2px 0 rgba(0, 0, 0, ${alpha})`,
          boxShadow:
            'var(--tw-ring-offset-shadow, 0 0 #0000), ' +
            'var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
        },
      });

      addUtilities({
        '.cf-pressed': pressed('.14'),
        '.cf-pressed-fill': pressed('.22'),
      });
    },

    // One control height for the whole product. The pair 44/40 is a decision
    // about touch targets versus pointer density, and a decision retyped once
    // per file stops being one: the seventh copy is where they start to
    // disagree. `tests/design.guard.test.cjs` refuses new hand-typed copies.
    function ({ addComponents, theme }) {
      addComponents({
        '.cf-control-h': {
          minHeight: '44px',
          [`@media (min-width: ${theme('screens.md')})`]: {
            minHeight: '40px',
          },
        },
        // Dense choice buttons keep their 32px visual body. These margins
        // reserve exactly the flow space used by RadioOption's transparent hit
        // area, so adjacent rows and wrapped lines never claim the same point.
        '.cf-dense-choice-touch-target': {
          marginBlock: '6px',
          [`@media (min-width: ${theme('screens.md')})`]: {
            marginBlock: '0',
          },
        },
      });
    },
  ],
};
