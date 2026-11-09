-- Table: public.conversations

-- DROP TABLE IF EXISTS public.conversations;

CREATE TABLE IF NOT EXISTS public.conversations
(
    id integer NOT NULL DEFAULT nextval('conversations_id_seq'::regclass),
    animal_id integer NOT NULL,
    user_low_id integer NOT NULL,
    user_high_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_message_at timestamp without time zone,
    CONSTRAINT conversations_pkey PRIMARY KEY (id),
    CONSTRAINT conversations_animal_id_fkey FOREIGN KEY (animal_id)
        REFERENCES public.animals (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT conversations_user_high_id_fkey FOREIGN KEY (user_high_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT conversations_user_low_id_fkey FOREIGN KEY (user_low_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.conversations
    OWNER to postgres;
-- Index: uq_conversation_pair

-- DROP INDEX IF EXISTS public.uq_conversation_pair;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_pair
    ON public.conversations USING btree
    (animal_id ASC NULLS LAST, user_low_id ASC NULLS LAST, user_high_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;