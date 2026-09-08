const EMPHASIZED_PHRASE = "逐句拆解与核心考点剖析";

function FeatureContent({ text }) {
  const [title, ...descriptionParts] = String(text || "").split("：");
  const description = descriptionParts.join("：");
  const emphasisIndex = description.indexOf(EMPHASIZED_PHRASE);

  return (
    <>
      {descriptionParts.length ? <strong>{title}</strong> : title}
      {descriptionParts.length ? "：" : null}
      {emphasisIndex >= 0 ? (
        <>
          {description.slice(0, emphasisIndex)}
          <strong>{EMPHASIZED_PHRASE}</strong>
          {description.slice(emphasisIndex + EMPHASIZED_PHRASE.length)}
        </>
      ) : description}
    </>
  );
}

export default function PurchaseFeatureList({ features, className }) {
  return (
    <ul className={className}>
      {(features || []).map((item) => (
        <li key={item}>
          <FeatureContent text={item} />
        </li>
      ))}
    </ul>
  );
}
