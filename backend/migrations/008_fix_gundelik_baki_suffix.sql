UPDATE categories
SET seo_description = replace(seo_description, 'Gündəlik Bakı-da', 'Gündəlik Bakıda')
WHERE seo_description LIKE '%Gündəlik Bakı-da%';
