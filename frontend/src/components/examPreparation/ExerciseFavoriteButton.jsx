import "./ExerciseFavoriteButton.css";

export default function ExerciseFavoriteButton({
  isFavorited = false,
  pending = false,
  onClick,
  label = "收藏题目",
}) {
  return (
    <button
      type="button"
      className={[
        "exam-favorite-btn",
        isFavorited ? "is-favorited" : "",
      ].filter(Boolean).join(" ")}
      aria-label={isFavorited ? `取消${label}` : label}
      onClick={onClick}
      disabled={pending}
      title={isFavorited ? "取消收藏" : "收藏"}
    >
      <span className="exam-favorite-btn__star" aria-hidden="true">
        {isFavorited ? "★" : "☆"}
      </span>
    </button>
  );
}
