CREATE OR REPLACE FUNCTION "protect_published_figma_explanation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD.status = 'published' THEN
		IF TG_OP = 'UPDATE'
		   AND NEW.author_user_id IS NULL
		   AND OLD.author_user_id IS NOT NULL
		   AND (to_jsonb(NEW) - 'author_user_id') = (to_jsonb(OLD) - 'author_user_id') THEN
			RETURN NEW;
		END IF;
		IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
			RETURN OLD;
		END IF;
		RAISE EXCEPTION 'published Figma explanations are immutable';
	END IF;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END;
$$;
