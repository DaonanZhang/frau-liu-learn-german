import Swal from "sweetalert2";

export async function confirmMockExamAction(title, text) {
  const result = await Swal.fire({
    icon: "warning",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: "继续",
    cancelButtonText: "取消",
    reverseButtons: true,
  });
  return result.isConfirmed;
}
