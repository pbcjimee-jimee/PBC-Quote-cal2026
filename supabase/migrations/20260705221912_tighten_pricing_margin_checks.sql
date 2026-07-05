DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pricing_settings
    WHERE f2_margin < 0 OR f2_margin >= 1
       OR f3_margin < 0 OR f3_margin >= 1
       OR f4_margin < 0 OR f4_margin >= 1
       OR f5_margin < 0 OR f5_margin >= 1
  ) THEN
    RAISE EXCEPTION
      'Cannot tighten pricing_settings margin checks: existing f2_margin, f3_margin, f4_margin, and f5_margin values must be >= 0 and < 1.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pricing_settings'::regclass
      AND conname = 'pricing_settings_f2_margin_range'
  ) THEN
    ALTER TABLE public.pricing_settings
      ADD CONSTRAINT pricing_settings_f2_margin_range
        CHECK (f2_margin >= 0 AND f2_margin < 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pricing_settings'::regclass
      AND conname = 'pricing_settings_f3_margin_range'
  ) THEN
    ALTER TABLE public.pricing_settings
      ADD CONSTRAINT pricing_settings_f3_margin_range
        CHECK (f3_margin >= 0 AND f3_margin < 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pricing_settings'::regclass
      AND conname = 'pricing_settings_f4_margin_range'
  ) THEN
    ALTER TABLE public.pricing_settings
      ADD CONSTRAINT pricing_settings_f4_margin_range
        CHECK (f4_margin >= 0 AND f4_margin < 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pricing_settings'::regclass
      AND conname = 'pricing_settings_f5_margin_range'
  ) THEN
    ALTER TABLE public.pricing_settings
      ADD CONSTRAINT pricing_settings_f5_margin_range
        CHECK (f5_margin >= 0 AND f5_margin < 1);
  END IF;
END $$;
