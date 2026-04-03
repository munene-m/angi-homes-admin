type ModulePlaceholderPageProps = {
  title: string;
  description: string;
};

const ModulePlaceholderPage = ({ title, description }: ModulePlaceholderPageProps) => {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-(--color-primary)">{title}</h1>
      <p className="mt-1 text-sm text-(--color-primary)/70">{description}</p>
    </section>
  );
};

export default ModulePlaceholderPage;
