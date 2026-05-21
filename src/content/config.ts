import { defineCollection, z } from 'astro:content';

const analysis = defineCollection({
  type: 'content',
  schema: z.object({
    title:       z.string(),
    description: z.string(),
    date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tags:        z.array(z.string()).default([]),
    og_image:    z.string().optional(),
    status:      z.enum(['published', 'draft']).default('draft'),
    author:      z.string().default('Matt Donders'),
  }),
});

export const collections = { analysis };
